import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ProfileProvider, useProfile } from "./context/ProfileContext.jsx";
import Home from "./pages/Home.jsx";
import Lobby from "./pages/Lobby.jsx";
import CallRoom from "./pages/CallRoom.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import "./App.css";

// Shows the one-time onboarding screen instead of whatever route someone
// actually landed on, for as long as they're signed in but have no saved
// profile yet — this runs above <Routes> rather than as a route of its own
// so it catches every entry point (a shared /call/:roomCode link included),
// not just the home page. Signed-out visitors and anyone who's already
// onboarded pass straight through unaffected.
function OnboardingGate({ children }) {
  const { authenticated } = useAuth();
  const { needsOnboarding } = useProfile();
  if (authenticated && needsOnboarding) return <Onboarding />;
  return children;
}

// Guards the Lobby and the call itself: signing in is required to actually
// attend a meeting, the same way Zoom/Meet require it, not just to use the
// "Start Class"/"Join Class" buttons on Home. That distinction matters
// because the realistic path into a call is a link the teacher shared
// directly (e.g. .../call/ABC123), never touching those buttons at all — a
// gate placed only on Home's onClick handlers would do nothing for that
// path. Home itself stays open to signed-out visitors so they can land on
// it and see the "Sign in" button in the first place.
function RequireAuth({ children }) {
  const { initialized, authenticated, login } = useAuth();

  useEffect(() => {
    if (initialized && !authenticated) login();
  }, [initialized, authenticated, login]);

  if (!initialized || !authenticated) return null;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <ProfileProvider>
            <BrowserRouter>
              <OnboardingGate>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/join/:roomCode" element={<RequireAuth><Lobby /></RequireAuth>} />
                  <Route path="/call/:roomCode" element={<RequireAuth><CallRoom /></RequireAuth>} />
                </Routes>
              </OnboardingGate>
            </BrowserRouter>
          </ProfileProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
