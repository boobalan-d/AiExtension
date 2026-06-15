<div align="center">
  
  # ✨ AiSolutions
  **The ultimate, stealthy AI knowledge assistant built right into your browser.**
  
  [![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=for-the-badge&color=c9a84e)](#)
  [![Manifest](https://img.shields.io/badge/Manifest-V3-success.svg?style=for-the-badge&color=2ea043)](#)
  [![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge&color=3a3a35)](#)

  <br />
  <p align="center">
    Select text anywhere. Get instant context. Type answers magically. 
    <br />
    No copy-paste restrictions, no UI clutter.
  </p>

</div>

---

## ⚡ Overview

**AiSolutions** is a next-generation Chrome extension designed for students, researchers, and developers who need answers without breaking their flow. By leveraging the GitHub Models API, it provides a seamless, streaming ChatGPT-style interface directly over any webpage. 

Unlike traditional extensions that shove you into a clunky side panel, AiSolutions uses advanced **Shadow DOM isolation** to float a premium, glassmorphism UI precisely where your cursor is. 

But the real magic is the **"Type It" Engine**: an advanced DOM-event simulator that bypasses strict website anti-paste mechanisms and IDE auto-indent hooks, allowing you to fluidly type AI-generated code and text directly into restricted input fields as if you were typing it yourself.

---

## 🚀 Pro-Level Features

### 🎨 Premium Glassmorphism UI
- **Dynamic Positioning:** The "Answer" button doesn't just float randomly—it dynamically anchors to the exact bottom-right coordinates of your text selection using advanced `getClientRects()` calculations.
- **Shadow DOM Isolation:** 100% immune to CSS bleeding. The host website cannot break the extension's UI, and the extension will never break the host website.
- **Native Polish:** Features deep `backdrop-filter` blurs, cubic-bezier spring animations, soft glowing focus rings, and custom macOS-style scrollbars. No cheesy "overglow" AI effects—just pure, refined aesthetics.

### ⌨️ The "Type It" Stealth Engine
- **Anti-Paste Bypass:** Circumvents strict online exam and coding platforms that block `Ctrl+V`.
- **IDE-Safe Code Injection:** Intelligent tokenization chunks newlines (`\n`) and subsequent whitespace together. This tricks editors (like Monaco/CodeMirror) into treating the insertion as a paste, bypassing their aggressive auto-indentation hooks so code formatting remains **perfectly 1:1 with the source**.
- **Human Speed Simulation:** Variable typing speeds (Slow, Medium, Fast, Instant) with randomized typing jitter to simulate real human keystrokes.

### 🧠 Advanced Model Cascading & Streaming
- **SSE (Server-Sent Events) Streaming:** Answers stream in real-time with zero latency.
- **Continuous Chat History:** Maintains conversation context within the popup. Ask follow-up questions seamlessly.
- **Quick Actions:** Instantly *Simplify*, *Expand*, *Translate* (to Hindi), or *Google* the highlighted text with a single click.
- **Robust Math & Markdown:** Full support for inline/block LaTeX equations and complex markdown tables natively rendered in the shadow root.

---

## 🛠️ Architecture

AiSolutions is built entirely with Vanilla JavaScript, maximizing performance and minimizing bundle size. 

| Component | Responsibility | Highlight |
| :--- | :--- | :--- |
| `background.js` | Service Worker | Orchestrates the GitHub Models API connection, manages the Server-Sent Events (SSE) stream, and securely stores the API key. |
| `content.js` | UI Injector & DOM Engine | Mounts the Shadow DOM popup, calculates dynamic X/Y bounds, handles the ChatGPT-style conversation array, and runs the `typeIntoField` algorithm. |
| `content.css` | Styling & Animations | Delivers the premium UI. Employs `-webkit-mask` composite gradients for glowing borders and hardware-accelerated transforms. |

---

## 📦 Installation (Developer Mode)

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/yourusername/AiSolutions.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button and select the `AiSolutions` directory.
5. The extension is now installed! 

*Note: To use the extension, ensure you have configured your GitHub PAT within the extension settings.*

---

## 🎯 Usage

1. **Highlight Text:** Select any text on any webpage.
2. **Trigger AI:** Click the sleek golden ⚡ **Answer** button that appears exactly at the end of your selection.
3. **Read & Interact:** Watch the AI stream its response in the floating glass panel. Ask follow-up questions using the chat bar at the bottom.
4. **Type It:** Need the answer in an input field? Click the **"Type It"** tab, verify the raw text, click "Select Input Field", and then click anywhere on the page to watch the text magically type itself out.

---

## 🤝 Contributing

Contributions, issues, and feature requests are highly welcome! We are specifically looking for help expanding the capabilities of the background Service Worker and adding Vision (OCR) capabilities for unselectable text.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

<div align="center">
  <p>Built with 🖤 by boobalan. Elevating the standard for browser extensions.</p>
</div>
