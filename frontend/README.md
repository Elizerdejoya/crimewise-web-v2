# CrimeWiseSys - Online Forensic Examination System

This project is a web-based application designed for creating, managing, and taking forensic science examinations online.

## Project Setup

**Prerequisites:**

*   **Node.js & npm:** Download and install the LTS version from [https://nodejs.org/](https://nodejs.org/). Verify with `node -v` and `npm -v`.
*   **Bun:** Install using the command for your OS from [https://bun.sh/docs/installation](https://bun.sh/docs/installation). Verify with `bun --version`.
*   **Code Editor:** VS Code is recommended ([https://code.visualstudio.com/download](https://code.visualstudio.com/download)).

**Steps:**

1.  **Download & Extract:**
    *   Download the project zip file.
    *   Extract the contents to a folder on your computer (e.g., `crimewisesys`).

2.  **Open in VS Code:**
    *   Open the project folder (`crimewisesys`) in VS Code (`File` > `Open Folder...`).
    *   Trust the workspace if prompted.

3.  **Install Dependencies:**
    *   Open the VS Code integrated terminal (`Terminal` > `New Terminal`).
    *   Make sure you are in the main project directory (`crimewisesys`).
    *   Install root dependencies:
        ```bash
        bun install
        ```
    *   Install server dependencies:
        ```bash
        cd server
        bun install
        cd ..
        ```

4.  **Run the Application:**
    *   **Backend:** Open a new terminal, navigate to the `server` directory, and run:
        ```bash
        # Make sure you are in the server/ directory
        bun start 
        # Or check server/package.json for the correct start script
        ```
        (Keep this terminal running)
    *   **Frontend:** Open another new terminal in the project root directory (`crimewisesys`) and run:
        ```bash
        bun run dev
        ```
        (Keep this terminal running)

5.  **Access:** Open your browser and navigate to the frontend URL provided (usually `http://localhost:8082`).

**Stopping the Project:**

*   Press `Ctrl + C` in each of the running terminals (frontend and backend).
