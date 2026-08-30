import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ProfileProvider, ProfileContext } from "./context/ProfileContext.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";
import "./index.css";

function SocketBridge({ children }) {
  const { profile } = React.useContext(ProfileContext);
  return <SocketProvider profile={profile}>{children}</SocketProvider>;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ProfileProvider>
      <SocketBridge>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SocketBridge>
    </ProfileProvider>
  </React.StrictMode>
);
