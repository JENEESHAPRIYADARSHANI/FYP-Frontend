import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import Home from "./pages/Home.jsx";
import Lobby from "./pages/Lobby.jsx";
import CallRoom from "./pages/CallRoom.jsx";
import "./App.css";

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join/:roomCode" element={<Lobby />} />
            <Route path="/call/:roomCode" element={<CallRoom />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
