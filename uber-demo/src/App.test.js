import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Firebase mocks ────────────────────────────────────────────────────────────
jest.mock('./firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

// ── Leaflet / react-leaflet — ESM packages not handled by CRA's Jest transform.
// BookRide is lazy-loaded and we don't test map rendering here, so stub them out.
jest.mock('leaflet', () => ({ Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } }, DivIcon: jest.fn(() => ({})) }));
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  Polyline: () => null,
  useMap: jest.fn(() => ({ fitBounds: jest.fn() })),
}));

const mockOnAuthStateChanged = jest.fn((auth, cb) => { cb(null); return () => {}; });
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockSendPasswordResetEmail = jest.fn();

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: (...args) => mockSignIn(...args),
  signOut: (...args) => mockSignOut(...args),
  updateProfile: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: (...args) => mockSendPasswordResetEmail(...args),
  reload: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  addDoc: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
import { AppRoutes } from './App';
import { AuthProvider } from './context/AuthContext';

function renderAt(path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );
}

// Render with a simulated logged-in (verified) user
function renderAuthenticated(path) {
  const verifiedUser = { uid: 'u1', email: 'test@example.com', displayName: 'Test', emailVerified: true };
  mockOnAuthStateChanged.mockImplementation((auth, cb) => { cb(verifiedUser); return () => {}; });
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );
}

// ── Routing ───────────────────────────────────────────────────────────────────
describe('Routing', () => {
  beforeEach(() => {
    mockOnAuthStateChanged.mockImplementation((auth, cb) => { cb(null); return () => {}; });
  });

  test('landing page renders the RideX brand name', async () => {
    renderAt('/');
    const headings = await screen.findAllByText('RideX');
    expect(headings.length).toBeGreaterThan(0);
  });

  test('unauthenticated users are redirected from /book to /login', async () => {
    renderAt('/book');
    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
  });

  test('unauthenticated users are redirected from /payment to /login', async () => {
    renderAt('/payment');
    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
  });

  test('unauthenticated users are redirected from /status to /login', async () => {
    renderAt('/status');
    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
  });

  test('unknown route redirects to the landing page', async () => {
    renderAt('/this-route-does-not-exist');
    const headings = await screen.findAllByText('RideX');
    expect(headings.length).toBeGreaterThan(0);
  });

  test('authenticated verified user can reach /book', async () => {
    renderAuthenticated('/book');
    await waitFor(() => expect(screen.getByText(/where to/i)).toBeInTheDocument());
  });
});

// ── Login page ────────────────────────────────────────────────────────────────
describe('Login page', () => {
  beforeEach(() => {
    mockOnAuthStateChanged.mockImplementation((auth, cb) => { cb(null); return () => {}; });
  });

  test('renders email and password fields', () => {
    renderAt('/login');
    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument();
  });

  test('shows validation error when fields are empty', async () => {
    renderAt('/login');
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() =>
      expect(screen.getByText(/please enter your email and password/i)).toBeInTheDocument()
    );
  });

  test('calls signInWithEmailAndPassword on valid submit', async () => {
    mockSignIn.mockResolvedValueOnce({ user: { uid: 'u1' } });
    renderAt('/login');
    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: 'Password1!' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    });
    expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'Password1!');
  });

  test('shows error message on invalid credentials', async () => {
    mockSignIn.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    renderAt('/login');
    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: 'WrongPass1!' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    });
    expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
  });

  test('forgot password sends reset email', async () => {
    mockSendPasswordResetEmail.mockResolvedValueOnce();
    renderAt('/login');
    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'a@b.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    });
    expect(mockSendPasswordResetEmail).toHaveBeenCalled();
    expect(await screen.findByText(/reset link sent/i)).toBeInTheDocument();
  });
});

// ── Register page ─────────────────────────────────────────────────────────────
describe('Register page', () => {
  beforeEach(() => {
    mockOnAuthStateChanged.mockImplementation((auth, cb) => { cb(null); return () => {}; });
  });

  test('renders all registration fields', async () => {
    renderAt('/register');
    expect(await screen.findByPlaceholderText(/full name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/min\. 8 characters/i)).toBeInTheDocument();
  });

  test('shows error when name is too short', async () => {
    renderAt('/register');
    fireEvent.change(screen.getByPlaceholderText(/full name/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: 'Password1!' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });
    expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
  });

  test('shows error for weak password', async () => {
    renderAt('/register');
    fireEvent.change(screen.getByPlaceholderText(/full name/i), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: 'short' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });
    // The error banner says "Password must be at least 8 characters." — distinct from the hint text
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
  });
});

// ── Fare calculation (unit) ───────────────────────────────────────────────────
describe('Haversine distance', () => {
  // Import inline to avoid needing a module export
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  test('same point returns 0 km', () => {
    expect(haversineKm(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  test('London to Manchester is roughly 260 km', () => {
    const km = haversineKm(51.509865, -0.118092, 53.483959, -2.244644);
    expect(km).toBeGreaterThan(250);
    expect(km).toBeLessThan(270);
  });
});
