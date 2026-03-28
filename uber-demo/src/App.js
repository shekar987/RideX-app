import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import BookRide from './pages/BookRide';
import RideStatus from './pages/RideStatus';
import Payment from './pages/Payment';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/book" element={
          <ProtectedRoute><BookRide /></ProtectedRoute>
        } />
        <Route path="/payment" element={
          <ProtectedRoute><Payment /></ProtectedRoute>
        } />
        <Route path="/status" element={
          <ProtectedRoute><RideStatus /></ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;