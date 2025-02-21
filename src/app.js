const express = require('express')
const sqlite3 = require('sqlite3').verbose();
const app = express()
const port = 3000

const db = new sqlite3.Database('./database/rental.sqlite', (err) => {
  if (err) {
      console.error('Error opening database: ' + err.message);
  } else {
      console.log('Connected to the SQLite database.');
  }
});

app.get('/', function(req, res){
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
