# Time–Area Method (MSMA) Calculator

A simple web-based calculator that replicates the Excel **Time–Area Method (MSMA)** rainfall–runoff workflow.  
Built with plain **HTML, CSS, and JavaScript** — no backend required.

🌐 **Live App:** [https://msma3th.onrender.com/](https://msma3th.onrender.com/)

---

## ✨ Features

- Implements the **IDF rainfall intensity equation**:  
  _i = K × ARI^x / (A + t)^n_
- Hyetograph builder using normalized **temporal rainfall pattern** (30 min storm, 5-min bins).
- Handles **pervious/impervious areas**, with **initial and continuous losses**.
- Outputs rainfall excess (mm) and rainfall excess rate (mm/s) per time step.
- Clean, responsive design (mobile-friendly).
- 100% client-side, no external libraries.

---

## 📂 Project Structure

.
├── index.html # Main app
├── style.css # Styling
├── app.js # Calculator logic
└── README.md # This file
