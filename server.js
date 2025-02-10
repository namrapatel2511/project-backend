require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Connect to AWS RDS MySQL
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});

// Connect to MySQL and create database if it doesn't exist
db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("Connected to MySQL RDS");

    // Create database if it doesn't exist
    db.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`, (err) => {
      if (err) console.error("Error creating database:", err);
      else console.log(`Database '${process.env.DB_NAME}' ready`);

      // Select the database
      db.changeUser({ database: process.env.DB_NAME }, (err) => {
        if (err) console.error("Error selecting database:", err);
        else {
          console.log(`Using database: ${process.env.DB_NAME}`);

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
