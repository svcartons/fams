import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider } from "./app/hooks/useAuth";
import App from "./app/App.tsx";
import "./styles/index.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);
