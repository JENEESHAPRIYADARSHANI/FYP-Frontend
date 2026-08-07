import { useState } from "react";
import { useNavigate } from "react-router-dom";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function Home() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");

  const startClass = () => {
    const code = generateRoomCode();
    navigate(`/join/${code}`);
  };

  const joinClass = (event) => {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/join/${code}`);
  };

  return (
    <div className="home">
      <div className="home-ambient" aria-hidden="true">
        <span className="blob blob-teal" />
        <span className="blob blob-amber" />
      </div>

      <header className="home-brand">
        <span className="brand-mark" />
        <span className="brand-name">SSL Connect</span>
      </header>

      <main className="home-hero">
        <h1>One room. Two languages, understood.</h1>
        <p className="home-lede">
          Live captions for spoken words, live recognition for signed ones —
          meet in a single room either way.
        </p>

        <div className="home-cards">
          <article className="role-card role-teacher">
            <span className="role-tag tag-amber">Teacher</span>
            <h2>Start a class</h2>
            <p>Create a room and share the code with your student.</p>
            <button className="btn btn-primary" onClick={startClass}>
              Start Class
            </button>
          </article>

          <article className="role-card role-student">
            <span className="role-tag tag-teal">Student</span>
            <h2>Join a class</h2>
            <p>Enter the code your teacher gave you.</p>
            <form onSubmit={joinClass}>
              <input
                className="field"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Room code"
                maxLength={6}
              />
              <button className="btn btn-primary" type="submit">
                Join Class
              </button>
            </form>
          </article>
        </div>
      </main>
    </div>
  );
}
