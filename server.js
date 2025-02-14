const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const AWS = require("aws-sdk");
const nodemailer = require("nodemailer");

AWS.config.update({ region: "us-east-1" });
const ssm = new AWS.SSM();

const app = express();
app.use(express.json());
app.use(cors());

async function getSSMParameter(name) {
  const result = await ssm.getParameter({ Name: name, WithDecryption: true }).promise();
  return result.Parameter.Value;
}

async function initializeDB() {
  try {
    const dbConfig = {
      host: await getSSMParameter("DB_HOST"),
      user: await getSSMParameter("DB_USER"),
      password: await getSSMParameter("DB_PASS"),
      database: await getSSMParameter("DB_NAME"),
    };

    const db = mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    db.connect((err) => {
      if (err) {
        console.error("Database connection failed:", err);
      } else {
        console.log("Connected to MySQL RDS");
        
        db.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`, (err) => {
          if (err) console.error("Error creating database:", err);
          else console.log(`Database '${dbConfig.database}' ready`);
          
          db.changeUser({ database: dbConfig.database }, (err) => {
            if (err) console.error("Error selecting database:", err);
            else {
              console.log(`Using database: ${dbConfig.database}`);

              const createTableQuery = `
                CREATE TABLE IF NOT EXISTS tasks (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  title VARCHAR(255) NOT NULL,
                  description TEXT,
                  time TIME,
                  date DATE,
                  email_id VARCHAR(255),
                  status ENUM('pending', 'in-progress', 'completed') DEFAULT 'pending'
                )`;
              db.query(createTableQuery, (err) => {
                if (err) console.error("Error creating tasks table:", err);
                else console.log("Tasks table is ready");
              });
              
              const addColumnsQuery = `
                ALTER TABLE tasks 
                ADD COLUMN IF NOT EXISTS time TIME,
                ADD COLUMN IF NOT EXISTS date DATE,
                ADD COLUMN IF NOT EXISTS email_id VARCHAR(255);`;
              db.query(addColumnsQuery, (err) => {
                if (err) console.error("Error adding missing columns:", err);
                else console.log("Checked and added missing columns if necessary");
              });
            }
          });
        });
      }
    });
    return db;
  } catch (error) {
    console.error("Error fetching parameters from AWS SSM:", error);
  }
}

initializeDB().then((db) => {
  app.get("/tasks", (req, res) => {
    db.query("SELECT * FROM tasks", (err, results) => {
      if (err) return res.status(500).send(err);
      res.json(results);
    });
  });

  app.post("/tasks", (req, res) => {
    const { title, description, time, date, email_id, status } = req.body;
    db.query(
      "INSERT INTO tasks (title, description, time, date, email_id, status) VALUES (?, ?, ?, ?, ?, ?)",
      [title, description, time, date, email_id, status],
      (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ message: "Task added", id: result.insertId });
      }
    );
  });

  app.patch("/tasks/:id", (req, res) => {
    db.query("UPDATE tasks SET status = 'completed' WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).send(err);
      res.json({ message: "Task marked as completed" });
    });
  });

  app.delete("/tasks/:id", (req, res) => {
    db.query("DELETE FROM tasks WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).send(err);
      res.json({ message: "Task deleted" });
    });
  });

  function checkPendingTasks() {
    db.query("SELECT * FROM tasks WHERE status = 'pending'", (err, results) => {
      if (err) {
        console.error("Error fetching pending tasks:", err);
        return;
      }
      const now = new Date();
      results.forEach(task => {
        const taskDateTime = new Date(`${task.date}T${task.time}`);
        if (taskDateTime - now <= 600000) {
          sendReminderEmail(task.email_id, task.title, task.description);
        }
      });
    });
  }

  function sendReminderEmail(email, title, description) {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "namraptl25@gmail.com",
        pass: "N@mrap@tel2511"
      }
    });

    let mailOptions = {
      from: "your-email@gmail.com",
      to: email,
      subject: "Task Pending Reminder",
      text: `Your task '${title}' is still pending. Description: ${description}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
      } else {
        console.log("Reminder email sent:", info.response);
      }
    });
  }

  setInterval(checkPendingTasks, 60000);

  app.listen(5000, () => console.log("Server running on port 5000"));
});
