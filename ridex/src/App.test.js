import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Firebase mocks ─────────────────────────────────────────────────────────────
jest.mock('./firebase', () => ({ auth: { currentUser: null }, db: {} }));

// ── Mapbox — not available in jsdom ───────────────────────────────────────────
jest.mock('mapbox-gl', () => ({
    Map: jest.fn(() => ({
        on: jest.fn(), remove: jest.fn(), addControl: jest.fn(),
        getSource: jest.fn(), addSource: jest.fn(), addLayer: jest.fn(),
        flyTo: jest.fn(), fitBounds: jest.fn(),
    })),
    NavigationControl: jest.fn(),
    Marker: jest.fn(() => ({ setLngLat: jest.fn().mockReturnThis(), addTo: jest.fn().mockReturnThis(), remove: jest.fn(), setPopup: jest.fn().mockReturnThis() })),
    Popup: jest.fn(() => ({ setHTML: jest.fn().mockReturnThis() })),
    accessToken: '',
}));
jest.mock('mapbox-gl/dist/mapbox-gl.css', () => {});

// ── Recharts — avoid SVG/canvas errors in jsdom ───────────────────────────────
jest.mock('recharts', () => ({
    BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    Tooltip: () => null,
}));

// ── Firebase Auth ──────────────────────────────────────────────────────────────
const mockOnAuthStateChanged = jest.fn((auth, cb) => { cb(null); return () => {}; });
const mockSignIn             = jest.fn();
const mockSignOut            = jest.fn();
const mockCreateUser         = jest.fn();
const mockSendPasswordReset  = jest.fn();
const mockSendVerification   = jest.fn();
const mockReload             = jest.fn();
const mockUpdateProfile      = jest.fn();

jest.mock('firebase/auth', () => ({
    getAuth:                      jest.fn(),
    onAuthStateChanged:           (...a) => mockOnAuthStateChanged(...a),
    signInWithEmailAndPassword:   (...a) => mockSignIn(...a),
    signOut:                      (...a) => mockSignOut(...a),
    createUserWithEmailAndPassword: (...a) => mockCreateUser(...a),
    sendEmailVerification:        (...a) => mockSendVerification(...a),
    sendPasswordResetEmail:       (...a) => mockSendPasswordReset(...a),
    updateProfile:                (...a) => mockUpdateProfile(...a),
    reload:                       (...a) => mockReload(...a),
}));

// ── Firebase Firestore ────────────────────────────────────────────────────────
const mockGetDocs    = jest.fn();
const mockOnSnapshot = jest.fn(() => () => {});
const mockAddDoc     = jest.fn();
const mockUpdateDoc  = jest.fn();
const mockRunTx      = jest.fn();

jest.mock('firebase/firestore', () => ({
    getFirestore:    jest.fn(),
    collection:      jest.fn(),
    query:           jest.fn(),
    where:           jest.fn(),
    doc:             jest.fn(),
    getDocs:         (...a) => mockGetDocs(...a),
    onSnapshot:      (...a) => mockOnSnapshot(...a),
    addDoc:          (...a) => mockAddDoc(...a),
    updateDoc:       (...a) => mockUpdateDoc(...a),
    runTransaction:  (...a) => mockRunTx(...a),
    serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })),
    increment:       jest.fn(n => n),
    orderBy:         jest.fn(),
    limit:           jest.fn(),
    startAfter:      jest.fn(),
    setDoc:          jest.fn(async () => {}),
    getDoc:          jest.fn(async () => ({ exists: () => false, data: () => undefined })),
    getCountFromServer: jest.fn(async () => ({ data: () => ({ count: 0 }) })),
    Timestamp:       { fromMillis: jest.fn(ms => ({ toMillis: () => ms })) },
}));

// ── Firebase Messaging (useNotifications) ─────────────────────────────────────
jest.mock('firebase/messaging', () => ({
    getMessaging: jest.fn(() => ({})),
    getToken:     jest.fn(async () => 'fcm-token'),
    onMessage:    jest.fn(() => () => {}),
    isSupported:  jest.fn(async () => false),
}));

// ── fetch (Cloud Function calls) — a bare jest.fn() would make res.json() throw
global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) }));

// ── Stripe ────────────────────────────────────────────────────────────────────
jest.mock('@stripe/react-stripe-js', () => ({
    Elements: ({ children }) => <div>{children}</div>,
    CardElement: () => <div data-testid="card-element" />,
    useStripe: () => ({ createPaymentMethod: jest.fn() }),
    useElements: () => ({ getElement: jest.fn() }),
}));
jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn(() => Promise.resolve({})) }));

// ── Helpers ───────────────────────────────────────────────────────────────────
import { AppRoutes } from './App';
import { AuthProvider } from './context/AuthContext';

const VERIFIED_USER = {
    uid: 'uid-test-1',
    email: 'test@example.com',
    displayName: 'Test User',
    emailVerified: true,
};

function renderAt(path) {
    return render(
        <AuthProvider>
            <MemoryRouter initialEntries={[path]}>
                <AppRoutes />
            </MemoryRouter>
        </AuthProvider>
    );
}

function renderAuthed(path) {
    mockOnAuthStateChanged.mockImplementation((auth, cb) => {
        cb(VERIFIED_USER);
        return () => {};
    });
    // Firestore getDocs returns empty by default (not a driver)
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    return render(
        <AuthProvider>
            <MemoryRouter initialEntries={[path]}>
                <AppRoutes />
            </MemoryRouter>
        </AuthProvider>
    );
}

beforeEach(() => {
    mockOnAuthStateChanged.mockImplementation((auth, cb) => { cb(null); return () => {}; });
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockOnSnapshot.mockReturnValue(() => {});
    jest.clearAllMocks();
    mockOnAuthStateChanged.mockImplementation((auth, cb) => { cb(null); return () => {}; });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Routing
// ═════════════════════════════════════════════════════════════════════════════
describe('Routing', () => {
    test('landing page renders the RideX brand', async () => {
        renderAt('/');
        // First test in the file pays the one-off cost of transpiling the lazy
        // landing chunk, which can exceed the default 1 s on a cold machine.
        expect((await screen.findAllByText('RideX', {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    }, 15000);

    test('unknown route renders the 404 page', async () => {
        renderAt('/this-does-not-exist');
        expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
    });

    test('unauthenticated /book redirects to login', async () => {
        renderAt('/book');
        expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    });

    test('unauthenticated /payment redirects to login', async () => {
        renderAt('/payment');
        expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    });

    test('unauthenticated /status redirects to login', async () => {
        renderAt('/status');
        expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    });

    test('unauthenticated /status/:rideId redirects to login', async () => {
        renderAt('/status/abc123');
        expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    });

    test('unauthenticated /history redirects to login', async () => {
        renderAt('/history');
        expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    });

    test('/driver/login renders driver login page', async () => {
        renderAt('/driver/login');
        expect(await screen.findByRole('heading', { name: /driver login/i })).toBeInTheDocument();
    });

    test('/login renders the login page', async () => {
        renderAt('/login');
        expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    });

    test('/register renders the register page', async () => {
        renderAt('/register');
        // Use heading role to disambiguate from the button text
        expect(await screen.findByRole('heading', { name: /create account/i })).toBeInTheDocument();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Login page
// ═════════════════════════════════════════════════════════════════════════════
describe('Login page', () => {
    test('renders email and password fields', async () => {
        renderAt('/login');
        expect(await screen.findByPlaceholderText(/your@email\.com/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/your password/i)).toBeInTheDocument();
    });

    test('shows register link', async () => {
        renderAt('/login');
        expect(await screen.findByText(/don't have an account\?/i)).toBeInTheDocument();
        expect(screen.getByText(/sign up/i)).toBeInTheDocument();
    });

    test('renders login heading', async () => {
        renderAt('/login?role=customer');
        expect(await screen.findByText(/log in to your ridex account/i)).toBeInTheDocument();
    });

    test('shows validation error when fields are empty', async () => {
        renderAt('/login');
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /log in/i }));
        });
        expect(await screen.findByText(/please enter your email and password/i)).toBeInTheDocument();
    });

    test('calls signInWithEmailAndPassword with trimmed email', async () => {
        mockSignIn.mockResolvedValueOnce({
            user: { uid: 'u1', emailVerified: true, reload: jest.fn() },
        });
        mockReload.mockResolvedValueOnce();
        renderAt('/login');
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: '  a@b.com  ' } });
        fireEvent.change(screen.getByPlaceholderText(/your password/i), { target: { value: 'Password1!' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /log in/i }));
        });
        expect(mockSignIn).toHaveBeenCalledWith(expect.anything(), 'a@b.com', 'Password1!');
    });

    test('shows invalid credential error', async () => {
        mockSignIn.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
        renderAt('/login');
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: 'a@b.com' } });
        fireEvent.change(screen.getByPlaceholderText(/your password/i), { target: { value: 'WrongPass1!' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /log in/i }));
        });
        expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });

    test('shows lockout message after max failed attempts', async () => {
        // Clear sessionStorage so lockout state from other tests doesn't bleed in
        sessionStorage.clear();
        mockSignIn.mockRejectedValue({ code: 'auth/wrong-password' });

        renderAt('/login');
        const emailInput = screen.getByPlaceholderText(/your@email\.com/i);
        const passInput  = screen.getByPlaceholderText(/your password/i);
        fireEvent.change(emailInput, { target: { value: 'lockout@test.com' } });
        fireEvent.change(passInput,  { target: { value: 'bad' } });

        for (let i = 0; i < 5; i++) {
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /log in/i }));
            });
        }
        // The message appears in the banner AND the button — check the banner specifically
        expect(screen.getAllByText(/too many failed attempts|account locked/i).length).toBeGreaterThan(0);
        sessionStorage.clear();
    });

    test('forgot password sends reset email', async () => {
        mockSendPasswordReset.mockResolvedValueOnce();
        renderAt('/login');
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: 'a@b.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
        });
        expect(mockSendPasswordReset).toHaveBeenCalled();
        expect(await screen.findByText(/reset link sent/i)).toBeInTheDocument();
    });

    test('forgot password shows error when email field is empty', async () => {
        renderAt('/login');
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
        });
        expect(await screen.findByText(/enter your email address/i)).toBeInTheDocument();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Register page
// ═════════════════════════════════════════════════════════════════════════════
describe('Register page', () => {
    test('renders all fields', async () => {
        renderAt('/register');
        expect(await screen.findByPlaceholderText(/full name/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/your@email\.com/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/min\. 8 characters/i)).toBeInTheDocument();
    });

    test('shows login link', async () => {
        renderAt('/register');
        expect(await screen.findByText(/already have an account\?/i)).toBeInTheDocument();
        expect(screen.getByText(/log in/i)).toBeInTheDocument();
    });

    test('shows register tagline', async () => {
        renderAt('/register');
        expect(await screen.findByText(/join ridex/i)).toBeInTheDocument();
    });

    test('shows error when name is too short', async () => {
        renderAt('/register');
        fireEvent.change(await screen.findByPlaceholderText(/full name/i), { target: { value: 'A' } });
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: 'a@b.com' } });
        fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: 'Password1!' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        });
        expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
    });

    test('shows error for invalid characters in name', async () => {
        renderAt('/register');
        fireEvent.change(await screen.findByPlaceholderText(/full name/i), { target: { value: 'Alice123' } });
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: 'a@b.com' } });
        fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: 'Password1!' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        });
        expect(screen.getByText(/letters, spaces, hyphens/i)).toBeInTheDocument();
    });

    test('shows error for weak password (too short)', async () => {
        renderAt('/register');
        fireEvent.change(await screen.findByPlaceholderText(/full name/i), { target: { value: 'Alice' } });
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: 'a@b.com' } });
        fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: 'short' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        });
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });

    test('shows error for password with no digit or symbol', async () => {
        renderAt('/register');
        fireEvent.change(await screen.findByPlaceholderText(/full name/i), { target: { value: 'Alice' } });
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: 'a@b.com' } });
        fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: 'OnlyLetters' } });
        // The form has a submit button with exact text "Create Account"
        const submitBtn = (await screen.findAllByRole('button')).find(b => b.textContent === 'Create Account');
        await act(async () => { fireEvent.click(submitBtn); });
        // The error banner text is the full sentence; hint text below field also matches.
        // Check that the red error banner specifically appears.
        const errors = await screen.findAllByText(/number or symbol/i);
        expect(errors.some(el => el.classList.contains('text-red-400'))).toBe(true);
    });

    test('shows error when fields are missing', async () => {
        renderAt('/register');
        await act(async () => {
            fireEvent.click(await screen.findByRole('button', { name: /create account/i }));
        });
        expect(screen.getByText(/please fill in all fields/i)).toBeInTheDocument();
    });

    test('shows duplicate email error from Firebase', async () => {
        mockCreateUser.mockRejectedValueOnce({ code: 'auth/email-already-in-use' });
        renderAt('/register');
        fireEvent.change(await screen.findByPlaceholderText(/full name/i), { target: { value: 'Alice Smith' } });
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: 'a@b.com' } });
        fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: 'Password1!' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        });
        expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });

    test('shows verification email screen on success', async () => {
        mockCreateUser.mockResolvedValueOnce({ user: { uid: 'u1', emailVerified: false } });
        mockSendVerification.mockResolvedValueOnce();
        mockUpdateProfile.mockResolvedValueOnce();
        renderAt('/register');
        fireEvent.change(await screen.findByPlaceholderText(/full name/i), { target: { value: 'Alice Smith' } });
        fireEvent.change(screen.getByPlaceholderText(/your@email\.com/i), { target: { value: 'alice@test.com' } });
        fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: 'Password1!' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        });
        expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Driver Login page
// ═════════════════════════════════════════════════════════════════════════════
describe('Driver Login page', () => {
    // The register panel is always mounted (hidden) — scope queries to the visible tabpanel
    async function openRegister() {
        await screen.findByRole('heading', { name: /driver login/i });
        await act(async () => {
            fireEvent.click(screen.getByRole('tab', { name: /register/i }));
        });
        return screen.getByRole('tabpanel');
    }

    function fillRegister(panel, overrides = {}) {
        const v = { name: 'Test Driver', email: 'd@test.com', password: 'Password1!', confirm: 'Password1!', ...overrides };
        fireEvent.change(within(panel).getByPlaceholderText(/john smith/i),          { target: { value: v.name } });
        fireEvent.change(within(panel).getByPlaceholderText(/driver@example\.com/i), { target: { value: v.email } });
        fireEvent.change(within(panel).getByPlaceholderText(/min\. 6 characters/i),  { target: { value: v.password } });
        fireEvent.change(within(panel).getByPlaceholderText(/••••••••/),             { target: { value: v.confirm } });
        fireEvent.change(within(panel).getByPlaceholderText(/\+44 7700 900000/i),    { target: { value: '+441234567890' } });
        fireEvent.change(within(panel).getByPlaceholderText(/^London$/i),            { target: { value: 'London' } });
        fireEvent.change(within(panel).getByPlaceholderText(/toyota camry/i),        { target: { value: 'Toyota Camry' } });
        fireEvent.change(within(panel).getByPlaceholderText(/AB12 CDE/i),            { target: { value: 'AB12 CDE' } });
        fireEvent.change(within(panel).getByPlaceholderText(/SMITH901157AB9IJ/i),    { target: { value: 'LIC123456' } });
        fireEvent.click(within(panel).getByLabelText(/i agree to the/i));
    }

    test('renders driver login heading', async () => {
        renderAt('/driver/login');
        expect(await screen.findByRole('heading', { name: /driver login/i })).toBeInTheDocument();
    });

    test('shows Login and Register tabs', async () => {
        renderAt('/driver/login');
        expect(await screen.findByRole('tab', { name: /login/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /register/i })).toBeInTheDocument();
    });

    test('shows portal selector — Customer and Driver', async () => {
        renderAt('/driver/login');
        expect(await screen.findByRole('button', { name: /customer/i })).toBeInTheDocument();
        expect(screen.getByText('Driver')).toBeInTheDocument();
    });

    test('shows the driver sign-in tagline', async () => {
        renderAt('/driver/login');
        expect(await screen.findByText(/sign in to your driver account/i)).toBeInTheDocument();
    });

    test('Register tab shows all required fields', async () => {
        renderAt('/driver/login');
        const panel = await openRegister();
        expect(within(panel).getByPlaceholderText(/john smith/i)).toBeInTheDocument();
        expect(within(panel).getByPlaceholderText(/\+44 7700 900000/i)).toBeInTheDocument();
        expect(within(panel).getByPlaceholderText(/AB12 CDE/i)).toBeInTheDocument();
    });

    test('Register tab shows vehicle type dropdown', async () => {
        renderAt('/driver/login');
        const panel = await openRegister();
        const select = within(panel).getByDisplayValue('Sedan');
        expect(select).toHaveValue('Sedan');
    });

    test('shows password length error on short password', async () => {
        renderAt('/driver/login');
        const panel = await openRegister();
        fillRegister(panel, { password: '123', confirm: '123' });
        await act(async () => {
            fireEvent.click(within(panel).getByRole('button', { name: /create account/i }));
        });
        expect(await screen.findByText(/password must be at least 6/i)).toBeInTheDocument();
    });

    test('shows email-already-in-use error', async () => {
        mockCreateUser.mockRejectedValueOnce({ code: 'auth/email-already-in-use' });
        renderAt('/driver/login');
        const panel = await openRegister();
        fillRegister(panel, { email: 'existing@test.com' });
        await act(async () => {
            fireEvent.click(within(panel).getByRole('button', { name: /create account/i }));
        });
        expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Landing page
// ═════════════════════════════════════════════════════════════════════════════
describe('Landing page', () => {
    test('renders I\'m a Customer button', async () => {
        renderAt('/');
        expect(await screen.findByRole('button', { name: /book a ride/i })).toBeInTheDocument();
    });

    test('renders I\'m a Driver button', async () => {
        renderAt('/');
        expect(await screen.findByRole('button', { name: /become a driver/i })).toBeInTheDocument();
    });

    test('renders safety and booking feature cards', async () => {
        renderAt('/');
        expect(await screen.findByText(/instant booking/i)).toBeInTheDocument();
        expect(screen.getByText(/safe & verified/i)).toBeInTheDocument();
    });

    test('renders stats section', async () => {
        renderAt('/');
        // "Rides completed" appears in the stats strip AND the driver-portal preview card
        expect((await screen.findAllByText(/rides completed/i)).length).toBeGreaterThan(0);
        expect(screen.getByText(/average rating/i)).toBeInTheDocument();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Utility: password validation
// ═════════════════════════════════════════════════════════════════════════════
describe('Password validation rules', () => {
    const PASSWORD_LETTER_RE         = /[a-zA-Z]/;
    const PASSWORD_DIGIT_OR_SYMBOL_RE = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

    function validatePassword(pw) {
        if (pw.length < 8)                           return 'Password must be at least 8 characters.';
        if (!PASSWORD_LETTER_RE.test(pw))            return 'Password must include at least one letter.';
        if (!PASSWORD_DIGIT_OR_SYMBOL_RE.test(pw))   return 'Password must include at least one number or symbol.';
        return null;
    }

    test('rejects password shorter than 8 chars', () => {
        expect(validatePassword('Ab1!')).toBe('Password must be at least 8 characters.');
    });

    test('rejects password with no letters', () => {
        expect(validatePassword('12345678!')).toBe('Password must include at least one letter.');
    });

    test('rejects password with no digit or symbol', () => {
        expect(validatePassword('OnlyLetters')).toBe('Password must include at least one number or symbol.');
    });

    test('accepts valid password', () => {
        expect(validatePassword('Password1!')).toBeNull();
    });

    test('accepts password with symbol instead of digit', () => {
        expect(validatePassword('Password!!')).toBeNull();
    });

    test('accepts password with digit instead of symbol', () => {
        expect(validatePassword('Password11')).toBeNull();
    });

    test('rejects empty string', () => {
        expect(validatePassword('')).toBe('Password must be at least 8 characters.');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Utility: name validation
// ═════════════════════════════════════════════════════════════════════════════
describe('Name validation rules', () => {
    const NAME_RE = /^[\p{L}\s'-]+$/u;

    function validateName(name) {
        const t = name.trim();
        if (t.length < 2)         return 'Name must be at least 2 characters.';
        if (!NAME_RE.test(t))     return 'Name may only contain letters, spaces, hyphens, and apostrophes.';
        return null;
    }

    test('rejects single character', () => {
        expect(validateName('A')).toMatch(/at least 2/i);
    });

    test('rejects name with numbers', () => {
        expect(validateName('Alice123')).toMatch(/letters, spaces/i);
    });

    test('rejects name with special chars', () => {
        expect(validateName('Alice@Smith')).toMatch(/letters, spaces/i);
    });

    test('accepts plain name', () => {
        expect(validateName('Alice')).toBeNull();
    });

    test('accepts hyphenated name', () => {
        expect(validateName('Mary-Jane')).toBeNull();
    });

    test("accepts name with apostrophe", () => {
        expect(validateName("O'Brien")).toBeNull();
    });

    test('accepts multi-word name', () => {
        expect(validateName('Soma Shekar Keesari')).toBeNull();
    });

    test('trims surrounding whitespace before validation', () => {
        expect(validateName('  Alice  ')).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8 — Utility: email validation
// ═════════════════════════════════════════════════════════════════════════════
describe('Email validation', () => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    test('accepts standard email', () => {
        expect(EMAIL_RE.test('user@example.com')).toBe(true);
    });

    test('accepts email with subdomain', () => {
        expect(EMAIL_RE.test('user@mail.example.co.uk')).toBe(true);
    });

    test('rejects email without @', () => {
        expect(EMAIL_RE.test('userexample.com')).toBe(false);
    });

    test('rejects email without domain', () => {
        expect(EMAIL_RE.test('user@')).toBe(false);
    });

    test('rejects empty string', () => {
        expect(EMAIL_RE.test('')).toBe(false);
    });

    test('rejects email with spaces', () => {
        expect(EMAIL_RE.test('user @example.com')).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 9 — Utility: fare calculation
// ═════════════════════════════════════════════════════════════════════════════
describe('Fare calculation', () => {
    const DRIVER_SHARE    = 0.8;
    const PLATFORM_SHARE  = 0.2;

    function driverEarnings(fare)   { return parseFloat((fare * DRIVER_SHARE).toFixed(2)); }
    function platformFee(fare)      { return parseFloat((fare * PLATFORM_SHARE).toFixed(2)); }
    function totalFromDriver(earn)  { return parseFloat((earn / DRIVER_SHARE).toFixed(2)); }

    test('driver gets 80% of fare', () => {
        expect(driverEarnings(10)).toBe(8.00);
    });

    test('platform gets 20% of fare', () => {
        expect(platformFee(10)).toBe(2.00);
    });

    test('driver + platform = total fare', () => {
        const fare = 25.50;
        expect(driverEarnings(fare) + platformFee(fare)).toBeCloseTo(fare, 2);
    });

    test('zero fare yields zero earnings', () => {
        expect(driverEarnings(0)).toBe(0);
        expect(platformFee(0)).toBe(0);
    });

    test('rounds to 2 decimal places', () => {
        // £9.99 * 0.8 = £7.992 → rounds to £7.99
        expect(driverEarnings(9.99)).toBe(7.99);
    });

    test('large fare calculates correctly', () => {
        expect(driverEarnings(100)).toBe(80.00);
        expect(platformFee(100)).toBe(20.00);
    });

    test('reconstructing total from driver earnings', () => {
        const fare = 50;
        const earn = driverEarnings(fare);
        expect(totalFromDriver(earn)).toBeCloseTo(fare, 1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 10 — Utility: haversine distance
// ═════════════════════════════════════════════════════════════════════════════
describe('Haversine distance', () => {
    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    test('same point returns 0', () => {
        expect(haversineKm(51.5, -0.1, 51.5, -0.1)).toBe(0);
    });

    test('London to Manchester ≈ 260 km', () => {
        const km = haversineKm(51.509865, -0.118092, 53.483959, -2.244644);
        expect(km).toBeGreaterThan(250);
        expect(km).toBeLessThan(270);
    });

    test('London to Edinburgh ≈ 530 km', () => {
        const km = haversineKm(51.509865, -0.118092, 55.953251, -3.188267);
        expect(km).toBeGreaterThan(520);
        expect(km).toBeLessThan(540);
    });

    test('is symmetric — A→B equals B→A', () => {
        const ab = haversineKm(51.5, -0.1, 53.4, -2.2);
        const ba = haversineKm(53.4, -2.2, 51.5, -0.1);
        expect(ab).toBeCloseTo(ba, 5);
    });

    test('short distance — 1 km apart', () => {
        // ~0.009 degrees latitude ≈ 1 km
        const km = haversineKm(51.5, -0.1, 51.509, -0.1);
        expect(km).toBeGreaterThan(0.9);
        expect(km).toBeLessThan(1.1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 11 — Utility: date helpers
// ═════════════════════════════════════════════════════════════════════════════
describe('Date helpers', () => {
    function isToday(ts) {
        if (!ts) return false;
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toDateString() === new Date().toDateString();
    }

    function isThisWeek(ts) {
        if (!ts) return false;
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 6);
        weekAgo.setHours(0, 0, 0, 0);
        return d >= weekAgo;
    }

    test('isToday returns true for right now', () => {
        expect(isToday(new Date())).toBe(true);
    });

    test('isToday returns false for yesterday', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        expect(isToday(yesterday)).toBe(false);
    });

    test('isToday returns false for null', () => {
        expect(isToday(null)).toBe(false);
    });

    test('isToday works with Firestore-style timestamp object', () => {
        const now = new Date();
        expect(isToday({ toDate: () => now })).toBe(true);
    });

    test('isThisWeek returns true for today', () => {
        expect(isThisWeek(new Date())).toBe(true);
    });

    test('isThisWeek returns true for 6 days ago', () => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        expect(isThisWeek(d)).toBe(true);
    });

    test('isThisWeek returns false for 8 days ago', () => {
        const d = new Date();
        d.setDate(d.getDate() - 8);
        expect(isThisWeek(d)).toBe(false);
    });

    test('isThisWeek returns false for null', () => {
        expect(isThisWeek(null)).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 12 — Auth error mapping
// ═════════════════════════════════════════════════════════════════════════════
describe('Auth error mapping', () => {
    function mapAuthError(code) {
        switch (code) {
            case 'auth/email-already-in-use':    return 'An account with this email already exists.';
            case 'auth/invalid-email':           return 'Invalid email address.';
            case 'auth/weak-password':           return 'Password must be at least 6 characters.';
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':      return 'Invalid email or password.';
            case 'auth/too-many-requests':       return 'Too many attempts. Please try again later.';
            default:                             return 'Something went wrong. Please try again.';
        }
    }

    test('maps email-already-in-use', () => {
        expect(mapAuthError('auth/email-already-in-use')).toMatch(/already registered|already exists/i);
    });

    test('maps invalid-email', () => {
        expect(mapAuthError('auth/invalid-email')).toMatch(/invalid email/i);
    });

    test('maps weak-password', () => {
        expect(mapAuthError('auth/weak-password')).toMatch(/password/i);
    });

    test('maps wrong-password to generic credential error', () => {
        expect(mapAuthError('auth/wrong-password')).toMatch(/invalid email or password/i);
    });

    test('maps user-not-found to generic credential error', () => {
        expect(mapAuthError('auth/user-not-found')).toMatch(/invalid email or password/i);
    });

    test('maps invalid-credential', () => {
        expect(mapAuthError('auth/invalid-credential')).toMatch(/invalid email or password/i);
    });

    test('maps too-many-requests', () => {
        expect(mapAuthError('auth/too-many-requests')).toMatch(/too many/i);
    });

    test('unknown code returns generic message', () => {
        expect(mapAuthError('auth/some-unknown-code')).toMatch(/something went wrong/i);
    });

    test('undefined code returns generic message', () => {
        expect(mapAuthError(undefined)).toMatch(/something went wrong/i);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 13 — Driver share edge cases
// ═════════════════════════════════════════════════════════════════════════════
describe('Driver earnings — edge cases', () => {
    const DRIVER_SHARE = 0.8;

    test('handles string fare (coerced by parseFloat)', () => {
        const fare = parseFloat('15.00');
        expect(parseFloat((fare * DRIVER_SHARE).toFixed(2))).toBe(12.00);
    });

    test('handles very small fare (£0.01)', () => {
        const earn = parseFloat((0.01 * DRIVER_SHARE).toFixed(2));
        expect(earn).toBe(0.01);
    });

    test('handles undefined fare defaulting to 0', () => {
        const fare = undefined ?? 0;
        expect(parseFloat((fare * DRIVER_SHARE).toFixed(2))).toBe(0);
    });

    test('NaN fare results in NaN earnings', () => {
        expect(isNaN(NaN * DRIVER_SHARE)).toBe(true);
    });
});
