const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const AWS = require("aws-sdk");

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
        
        // Create database if not exists
        db.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`, (err) => {
          if (err) console.error("Error creating database:", err);
          else console.log(`Database '${dbConfig.database}' ready`);
          
          // Switch to the created database
          db.changeUser({ database: dbConfig.database }, (err) => {
            if (err) console.error("Error selecting database:", err);
            else {
              console.log(`Using database: ${dbConfig.database}`);

              // Create tasks table if it doesn't exist
              const createTableQuery = `
                CREATE TABLE IF NOT EXISTS tasks (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  title VARCHAR(255) NOT NULL,
                  description TEXT,
                  status ENUM('pending', 'in-progress', 'completed') DEFAULT 'pending'
                )`;
              db.query(createTableQuery, (err) => {
                if (err) console.error("Error creating tasks table:", err);
                else console.log("Tasks table is ready");
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
  // Get all tasks
  app.get("/tasks", (req, res) => {
    db.query("SELECT * FROM tasks", (err, results) => {
      if (err) return res.status(500).send(err);
      res.json(results);
    });
  });

  // Add a task
  app.post("/tasks", (req, res) => {
    const { title, description, status } = req.body;
    db.query(
      "INSERT INTO tasks (title, description, status) VALUES (?, ?, ?)",
      [title, description, status],
      (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ message: "Task added", id: result.insertId });
      }
    );
  });

  // Delete a task
  app.delete("/tasks/:id", (req, res) => {
    db.query("DELETE FROM tasks WHERE id = ?", [req.params.id], (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ message: "Task deleted" });
    });
  });

  app.listen(5000, () => console.log("Server running on port 5000"));
});
