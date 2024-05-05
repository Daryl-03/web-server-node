# Project Title: Custom Node.js Web Server

## Description
This project is a custom-built web server in Node.js, showcasing fundamental web server creation using core Node.js APIs. It serves as a practical example of implementing basic networking protocols and handling HTTP requests.

## Features
- **HTTP Server:** The server is capable of handling basic HTTP requests.
- **Modular Architecture:** The server functionality is spread across multiple modules:
  - **Echo Module:** Handles echoing back requests with simple responses.
  - **Utils Module:** Provides utility functions for the server operations.
- **Custom Protocol Handling:** Demonstrates how to implement and use custom protocols within a web server environment.

## Files and Directories
- **src/**: The source directory containing all the server logic.
  - **echo/**: Contains files related to the echo functionality of the server.
  - **protocol/**: Custom protocol implementations.
  - **index.ts**: The main entry point for the server.
  - **utils.ts**: Utility functions for server operations.
- **.gitignore**: Specifies intentionally untracked files to ignore.
- **README.md**: General information and guide on the repository.
- **log.txt**: Logs from the server's operations.
- **package.json**: Manages project metadata and dependencies.
- **package-lock.json**: Provides version information for all packages installed.
- **tsconfig.json**: Contains TypeScript configuration settings.

## How to Use
1. **Clone the Repository:**
   ```bash
   git clone https://github.com/Daryl-03/web-server-node.git

2. **Navigate to the Project Directory:**
   ```bash
   cd web-server-node

3. **Install Dependencies:**
   ```bash
   npm install

4. **Run the Server:**
   ```bash
   npm run dev