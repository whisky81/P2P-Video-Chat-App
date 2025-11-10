# Random P2P Meeting Application

A real-time peer-to-peer video chat application built with WebRTC technology.

## Features

- Peer-to-peer video calls
- WebRTC technology
- Responsive design
- Secure connections
- Easy setup and deployment

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Modern web browser with WebRTC support

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/whisky81/P2P-Video-Chat-App.git p2p
   cd p2p
   ```

2. **Install dependencies**
   ```bash
   # Install client dependencies
   cd client
   npm install
   
   # Install signaling server dependencies
   cd ../signaling-server
   npm install
   ```

## Running the Application

### Start the Signaling Server

```bash
cd signaling-server
node server.js
```

### Start the Client Application

```bash
cd client
npm start
```

### Accessing the Application

1. Open your web browser
2. Navigate to the client URL (typically `http://localhost:8080`)
3. Allow camera and microphone permissions
4. Share the room URL with another user to start a video call

## Advanced Configuration

### Using Ngrok for Public Access

To make your application accessible over the internet:

1. **Sign up for Ngrok**
   - Visit [ngrok.com](https://ngrok.com) and create an account
   - Get your authtoken from the dashboard

2. **Configure Ngrok**
   - Replace the `authtoken` in `config.yml` with your actual token

3. **Start Ngrok**
   ```bash
   ngrok start --all --config ./config.yml
   ```

4. **Update Configuration**
   - Open `client/config/Config.js`
   - Update `SIGNALING_SERVER_URL` to use the secure WebSocket URL:
   ```javascript
   const SIGNALING_SERVER_URL = 'wss://your-ngrok-subdomain.ngrok-free.app';
   ```

5. **Access Remotely**
   - Use the HTTPS URL provided by ngrok to access your application from any device

## Project Structure

```
p2p-video-chat/
├── client/                 # Frontend application
│   ├── config/
│   │   └── Config.js      # Application configuration
│   ├── core/
│   │   ├── MediaStreamManager.js  # Media stream handling
│   │   └── Peer.js        # WebRTC peer connection management
│   ├── index.html         # Main HTML file
│   ├── main.css           # Stylesheets
│   ├── main.js            # Main application logic
│   └── package.json       # Client dependencies
├── signaling-server/      # Signaling server
│   ├── server.js          # Server entry point
│   ├── SignalingServer.js # Signaling server logic
│   └── package.json       # Server dependencies
├── config.yml            # Ngrok configuration
└── README.md            # Project documentation
```