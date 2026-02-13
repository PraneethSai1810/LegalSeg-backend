# LegalSeg

**One-line:** AI-powered platform that analyzes Indian legal judgements and classifies rhetorical roles using NLP models.

---

## 🚀 Overview

LegalSeg is a full-stack legal-tech application designed to:

- Upload and analyze Indian court judgements
- Structure unformatted legal text
- Perform rhetorical role classification
- Provide a clean UI dashboard for case exploration

The system combines modern web technologies with NLP-based backend processing.

---

## ✨ Features

- Upload and manage legal judgement documents
- Structured extraction of legal sections
- Rhetorical role classification (ML/NLP support)
- Secure authentication (JWT-based)
- Dashboard to view and manage processed cases
- MongoDB storage for structured data

---

## 🛠 Tech Stack

### Frontend
- React.js
- Axios
- React Router
- Framer Motion

### Backend
- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication

### ML / NLP
- Python-based processing
- Transformer-based classification

---

## 📂 Repository Structure
LegalSeg/
│── Backend/
│ ├── controllers/
│ ├── routes/
│ ├── models/
│ ├── middleware/
│ ├── config/
│ └── server.js
│
│── Frontend/
│ ├── public/
│ ├── src/
│ └── package.json
│
└── README.md

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the repository

git clone https://github.com/PraneethSai1810/LegalSeg.git

cd LegalSeg  

---

### 2️⃣ Backend Setup

cd Backend
npm install
Create a `.env` file:
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
Run backend:

npm start


Backend runs at:

http://localhost:5000


---

### 3️⃣ Frontend Setup

cd Frontend
npm install
npm start


Frontend runs at:

http://localhost:3000


---

## 🔐 Authentication

- JWT-based login & registration
- Protected routes using middleware
- Token verification for secured APIs

---

## 📡 API Capabilities

- User registration & login
- Upload legal documents
- Store structured judgement data
- Fetch classified legal sections
- Secure data retrieval

---

## 🔮 Future Improvements

- Role-based access control
- Dockerized deployment
- Model optimization
- CI/CD pipeline
- Cloud deployment (AWS / GCP)

---

## 🔗 Related Repository

Backend-only repo:
https://github.com/PraneethSai1810/LegalSeg-backend

