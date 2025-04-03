const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(cors());

// Database Configuration (No AWS SSM, Use Hardcoded Env Variables from Jenkins)
const dbConfig = {
   host: process.env.DB_HOST,
   user: process.env.DB_USER,
   password: process.env.DB_PASS,
   database: process.env.DB_NAME,
};

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
   if (err) {
      console.error("Database connection failed:", err);
      return;
   }
   console.log("Connected to MySQL RDS");

   // Create Table if Not Exists
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
});

// Routes
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
      [title, description, time, date, email_id, status || "pending"],
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
      results.forEach((task) => {
         const taskDateTime = new Date(`${task.date}T${task.time}`);
         if (taskDateTime - now <= 600000) {
            sendReminderEmail(task.email_id, task.title, task.description);
         }
      });
   });
}

function sendReminderEmail(email, title, description) {
   if (!email) {
      console.log("No email provided, skipping reminder.");
      return;
   }

   let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
         user: process.env.EMAIL_USER,
         pass: process.env.EMAIL_PASS,
      },
   });

   let mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Task Pending Reminder",
      text: `Your task '${title}' is still pending. Description: ${description}`,
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
