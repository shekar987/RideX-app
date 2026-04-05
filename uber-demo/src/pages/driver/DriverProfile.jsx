import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../firebase';
import { useNavigate } from 'react-router-dom';

function DriverProfile({ driver, onDriverUpdate }) {
    const navigate = useNavigate();
    const [name, setName] = useState(driver?.name || '');
    const [phone, setPhone] = useState(driver?.phone || '');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (!name.trim()) { setError('Name cannot be empty.'); return; }
        if (!phone.trim()) { setError('Phone cannot be empty.'); return; }
        setSaving(true);
        setError('');
        try {
            await updateDoc(doc(db, 'drivers', driver.uid), { name: name.trim(), phone: phone.trim() });
            onDriverUpdate({ name: name.trim(), phone: phone.trim() });
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch {
            setError('Failed to save changes. Please try again.');
        }
        setSaving(false);
    };

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/driver/login');
    };

    const memberSince = driver?.createdAt?.toDate
        ? driver.createdAt.toDate().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : '—';

    const inputClass = 'w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 transition text-sm';
    const labelClass = 'block text-xs text-gray-400 mb-1.5 font-medium';

    return (
        <div className="space-y-5">
            {/* Avatar + stats */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                {driver?.profilePhoto ? (
                    <img
                        src={driver.profilePhoto}
                        alt="Profile"
                        className="w-20 h-20 rounded-full object-cover mx-auto mb-3 border-2 border-yellow-400"
                    />
                ) : (
                    <div className="w-20 h-20 rounded-full bg-yellow-400/10 border-2 border-yellow-400/30 flex items-center justify-center mx-auto mb-3 text-3xl">
                        👤
                    </div>
                )}
                <h3 className="text-lg font-black text-white">{driver?.name}</h3>
                <p className="text-gray-400 text-sm">{driver?.email}</p>

                <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-800">
                    <div>
                        <p className="text-xl font-black text-yellow-400">{driver?.totalRides || 0}</p>
                        <p className="text-xs text-gray-500">Total Rides</p>
                    </div>
                    <div>
                        <p className="text-xl font-black text-yellow-400">★ {parseFloat(driver?.rating || 5).toFixed(1)}</p>
                        <p className="text-xs text-gray-500">Rating</p>
                    </div>
                    <div>
                        <p className="text-sm font-black text-yellow-400">{memberSince}</p>
                        <p className="text-xs text-gray-500">Member Since</p>
                    </div>
                </div>
            </div>

            {/* Editable fields */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <p className="text-sm font-bold text-white">Personal Information</p>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}
                {saved && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                        <p className="text-green-400 text-sm">Changes saved successfully!</p>
                    </div>
                )}

                <div>
                    <label className={labelClass}>Full Name</label>
                    <input
                        type="text"
                        className={inputClass}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div>
                    <label className={labelClass}>Email Address</label>
                    <input
                        type="email"
                        className={inputClass + ' opacity-50 cursor-not-allowed'}
                        value={driver?.email || ''}
                        disabled
                    />
                    <p className="text-xs text-gray-600 mt-1">Email cannot be changed.</p>
                </div>
                <div>
                    <label className={labelClass}>Phone Number</label>
                    <input
                        type="tel"
                        className={inputClass}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelClass}>City</label>
                        <input type="text" className={inputClass + ' opacity-50 cursor-not-allowed'} value={driver?.city || ''} disabled />
                    </div>
                    <div>
                        <label className={labelClass}>Country</label>
                        <input type="text" className={inputClass + ' opacity-50 cursor-not-allowed'} value={driver?.country || ''} disabled />
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {saving ? (
                        <>
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Saving…
                        </>
                    ) : 'Save Changes'}
                </button>
            </div>

            {/* Vehicle info (read-only after approval) */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-bold text-white">Vehicle Details</p>
                <p className="text-xs text-gray-500">Vehicle information cannot be changed after approval. Contact support to update.</p>
                {[
                    { label: 'Vehicle Type', value: driver?.vehicleType },
                    { label: 'Make & Model', value: driver?.vehicleMake },
                    { label: 'Registration', value: driver?.vehicleReg },
                    { label: 'Year', value: driver?.vehicleYear },
                    { label: 'Licence No.', value: driver?.licenceNumber },
                ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between items-center py-1.5 border-b border-gray-800 last:border-0">
                        <span className="text-sm text-gray-400">{label}</span>
                        <span className="text-sm text-white font-medium">{value || '—'}</span>
                    </div>
                ))}
            </div>

            {/* Logout */}
            <button
                onClick={handleLogout}
                className="w-full py-3 bg-gray-900 border border-gray-800 text-red-400 font-bold rounded-xl hover:bg-red-500/10 hover:border-red-500/30 transition"
            >
                Logout
            </button>
        </div>
    );
}

export default DriverProfile;
