// Legal.jsx — Terms & Conditions and Privacy Policy pages.
// Linked from the driver registration form (which previously pointed at routes
// that did not exist and bounced applicants to the homepage, wiping the form).

import { Link, useNavigate } from 'react-router-dom';

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';

const CONTENT = {
    terms: {
        title: 'Terms & Conditions',
        updated: '1 September 2026',
        intro: 'These terms govern your use of the RideX platform as a passenger or as a driver. By creating an account you agree to them.',
        sections: [
            { heading: '1. The service', body: 'RideX connects passengers who need a journey with independent drivers who provide it. RideX is the booking and payment platform; the journey itself is provided by the driver.' },
            { heading: '2. Accounts', body: 'You must be 18 or over, give accurate details, keep your password private and tell us straight away if you think your account has been used without permission. Driver accounts are activated only after our review of the information supplied at registration.' },
            { heading: '3. Bookings and fares', body: 'The fare shown before you confirm is the price you pay for that journey. Fares are charged to your chosen payment method when you confirm the booking. A ride code is shown in your app and must be given to the driver before the journey starts.' },
            { heading: '4. Cancellations', body: 'You may cancel a booking free of charge until a driver has accepted it. Once a driver is on their way, cancellation fees may apply as shown in the app.' },
            { heading: '5. Driver obligations', body: 'Drivers must hold a valid licence and insurance for the vehicle they register, keep their details up to date, and treat passengers with courtesy. RideX may suspend a driver account where these obligations are not met.' },
            { heading: '6. Payments to drivers', body: 'Drivers receive 80% of each completed fare. Payouts are made through Stripe Connect once the driver has completed payout setup.' },
            { heading: '7. Liability', body: 'RideX provides the platform with reasonable care and skill but is not liable for delays or losses caused by events outside its control. Nothing in these terms limits liability that cannot be limited by law.' },
            { heading: '8. Changes', body: 'We may update these terms from time to time. Continued use of RideX after a change means you accept the updated terms.' },
        ],
    },
    privacy: {
        title: 'Privacy Policy',
        updated: '1 September 2026',
        intro: 'This policy explains what personal data RideX collects, why, and the choices you have.',
        sections: [
            { heading: '1. What we collect', body: 'Passengers: name, email, pickup and destination locations, ride history and payment status (card details are handled by Stripe and never reach our servers). Drivers: the details supplied at registration, live location while online, ride and earnings history.' },
            { heading: '2. Why we use it', body: 'To match passengers with drivers, show live journey progress, take payment and pay drivers, send ride notifications you have opted into, keep the platform secure, and meet legal obligations.' },
            { heading: '3. Location data', body: 'A driver’s location is collected only while they are online and is shared with a passenger only for the duration of that passenger’s ride. Passengers’ pickup and destination points are stored with the booking.' },
            { heading: '4. Sharing', body: 'We share data with Stripe (payments), Google Firebase (hosting, authentication, database and push notifications) and Mapbox (maps and address search). We do not sell personal data.' },
            { heading: '5. Retention', body: 'Ride records are kept as the financial audit trail for as long as required by law. You can ask us to delete other account data at any time.' },
            { heading: '6. Your rights', body: 'You can access, correct or ask for deletion of your data, and withdraw notification consent from your device settings, by contacting support@ridex.com.' },
        ],
    },
};

function Legal({ kind = 'terms' }) {
    const navigate = useNavigate();
    const page = CONTENT[kind] ?? CONTENT.terms;

    return (
        <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col">
            <header className="flex items-center justify-between px-5 md:px-8 py-4 border-b border-gray-800">
                <button
                    type="button"
                    onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
                    aria-label="Go back"
                    className={`flex items-center gap-1.5 text-gray-400 hover:text-white transition text-sm px-2 py-2 -ml-2 rounded ${ring}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>
                <Link to="/" aria-label="RideX — home" className={`flex items-center gap-2 rounded-lg ${ring}`}>
                    <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
                        <span className="text-black font-black text-xs">R</span>
                    </div>
                    <span className="text-lg font-black">RideX</span>
                </Link>
            </header>

            <main className="flex-1 max-w-2xl w-full mx-auto px-5 md:px-6 py-8 pb-safe">
                <h1 className="text-2xl sm:text-3xl font-black mb-1">{page.title}</h1>
                <p className="text-gray-500 text-xs mb-6">Last updated {page.updated}</p>
                <p className="text-gray-300 text-sm leading-relaxed mb-8">{page.intro}</p>

                <div className="space-y-6">
                    {page.sections.map(section => (
                        <section key={section.heading} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                            <h2 className="font-bold text-base mb-2">{section.heading}</h2>
                            <p className="text-gray-400 text-sm leading-relaxed">{section.body}</p>
                        </section>
                    ))}
                </div>

                <p className="text-gray-600 text-xs mt-10 text-center">
                    Questions? Email <a href="mailto:support@ridex.com" className={`text-yellow-400 hover:underline rounded ${ring}`}>support@ridex.com</a>
                </p>
            </main>
        </div>
    );
}

export default Legal;
