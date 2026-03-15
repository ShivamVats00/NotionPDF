# README

## 📄 NotionPDF

**Turn your Notion pages into clean, beautiful PDFs — instantly.**

NotionPDF is a lightweight web app built with React, TypeScript, and Vite that lets you export any Notion page as a well-formatted PDF. No more messy copy-pasting or broken layouts. Just paste a link, and get a PDF that actually looks good.

---

### ✨ Features

- **One-click export** — Paste a Notion page URL and download the PDF in seconds
- **Preserves formatting** — Headings, lists, callouts, tables, and code blocks all come through cleanly
- **Authentication support** — Connect your Notion account to access private pages
- **Fast and lightweight** — Built on Vite for blazing-fast performance
- **Responsive UI** — Works great on desktop and mobile

---

### 🚀 Getting Started

#### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

#### Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-username/NotionPDF.git
cd NotionPDF
```

1. **Install dependencies**

```bash
npm install
```

1. **Set up environment variables**

Create a `.env` file in the root directory:

```bash
VITE_NOTION_API_KEY=your_notion_integration_token
VITE_API_BASE_URL=http://localhost:3000
```

1. **Start the development server**

```bash
npm run dev
```

The app will be running at `http://localhost:5173`.

---

### 📁 Project Structure

```
NotionPDF/
├── api/
│   └── auth/          # Authentication logic for Notion OAuth
├── public/            # Static assets
├── src/
│   ├── assets/        # Images, icons, and other media
│   ├── components/    # Reusable React components
│   ├── hooks/         # Custom React hooks
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Helper functions and utilities
├── index.html         # App entry point
├── vite.config.ts     # Vite configuration
└── README.md
```

---

### 🛠️ Built With

| **Tech** | **Why** |
| --- | --- |
| React | Component-based UI |
| TypeScript | Type safety and better DX |
| Vite | Lightning-fast dev server and builds |
| Notion API | Fetching page content programmatically |

---

### 📝 Usage

1. Open the app in your browser
2. Paste a Notion page URL into the input field
3. Click **"Generate PDF"**
4. Your PDF will be downloaded automatically

> **Tip:** For private pages, make sure you've connected your Notion account through the authentication flow first.
> 

---

### 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m "Add your feature"`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Please make sure your code follows the existing style and passes all lint checks.

---

### 📄 License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.

