LegalSeg Backend

Backend service for LegalSeg – a platform that analyzes Indian legal judgements and supports rhetorical role classification.

🚀 Overview

This backend provides REST APIs for:

User authentication

Uploading legal documents

Processing and storing structured judgement data

Connecting with ML/NLP models for rhetorical role classification

Serving processed results to the frontend

Built to support a scalable full-stack legal-tech application.

🛠 Tech Stack

Node.js

Express.js

MongoDB

Mongoose

JWT Authentication

REST API Architecture

📂 Project Structure
legalSeg-backend/
│── controllers/
│── routes/
│── models/
│── middleware/
│── config/
│── server.js

⚙️ Installation & Setup
1️⃣ Clone the repository
git clone https://github.com/PraneethSai1810/LegalSeg-backend.git
cd LegalSeg-backend

2️⃣ Install dependencies
npm install

3️⃣ Create .env file
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key

4️⃣ Run the server
npm start


Server runs on:

http://localhost:5000

🔐 Authentication

JWT-based authentication

Protected routes using middleware

📡 API Features

User registration & login

Upload and manage legal documents

Fetch structured judgement data

Backend support for NLP-based classification

🔗 Related Repository

Full Stack repository:
👉 https://github.com/PraneethSai1810/LegalSeg

🧠 Future Improvements

Role-based access control

API rate limiting

Production deployment with Docker

Model optimization
