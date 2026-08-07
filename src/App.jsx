import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Lobby from "./pages/Lobby.jsx";
import CallRoom from "./pages/CallRoom.jsx";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:roomCode" element={<Lobby />} />
        <Route path="/call/:roomCode" element={<CallRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
