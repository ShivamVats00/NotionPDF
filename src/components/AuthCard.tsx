import { Header } from './Header';

export function AuthCard({ onLogin }: { onLogin: () => void }) {
    return (
        <div className="w-full max-w-lg">
            <Header subtitle="Convert any Notion page — including all nested subpages — into a beautifully formatted, downloadable PDF document." />
            
            <div className="glass-card p-8 text-center">
                <div className="mb-6">
                    <div className="notion-logo-container">
                        <svg width="36" height="36" viewBox="0 0 100 100" fill="none">
                            <path d="M6.017 4.313l55.333 -4.087c6.797 -0.583 8.543 -0.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277 -1.553 6.807 -6.99 7.193L24.467 99.967c-4.08 0.193 -6.023 -0.39 -8.16 -3.113L3.3 79.94c-2.333 -3.113 -3.3 -5.443 -3.3 -8.167V11.113c0 -3.497 1.553 -6.413 6.017 -6.8z" fill="#fff" />
                            <path fillRule="evenodd" clipRule="evenodd" d="M61.35 0.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.723 0.967 5.053 3.3 8.167l12.993 16.913c2.137 2.723 4.08 3.307 8.16 3.113L88.733 96.08c5.437 -0.387 6.99 -2.917 6.99 -7.193V20.64c0 -2.21 -0.873 -2.847 -3.443 -4.733L74.167 3.14C69.893 0.037 68.147 -0.357 61.35 0.227zM25.663 19.107c-5.13 0.39 -6.3 0.477 -9.217 -1.75L8.927 11.3c-0.777 -0.78 -0.383 -1.753 1.557 -1.947l53.193 -3.887c4.467 -0.39 6.793 1.167 8.543 2.527l9.123 6.61c0.39 0.197 1.36 1.36 0.193 1.36l-54.933 3.307 -0.94 -0.163zM19.803 88.3V30.367c0 -2.53 0.777 -3.697 3.103 -3.893L86 22.78c2.14 -0.193 3.107 1.167 3.107 3.693v57.547c0 2.53 -0.39 4.67 -3.883 4.863l-60.377 3.5c-3.493 0.193 -5.043 -0.97 -5.043 -4.083zM71.867 33.64c0.39 1.75 0 3.5 -1.75 3.7l-2.917 0.577v42.773c-2.527 1.36 -4.853 2.14 -6.797 2.14 -3.107 0 -3.883 -0.973 -6.21 -3.887L37.4 54.85v23.593l6.027 1.36s0 3.5 -4.857 3.5l-13.39 0.777c-0.39 -0.78 0 -2.723 1.357 -3.11l3.497 -0.97V45.973l-4.857 -0.39c-0.39 -1.75 0.58 -4.277 3.3 -4.473l14.367 -0.967 17.467 26.7V45.2l-5.053 -0.577c-0.39 -2.143 1.163 -3.7 3.103 -3.89l13.607 -0.78z" fill="#000" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-4 mb-2">
                        Connect with Notion
                    </h2>
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                        Sign in securely through Notion to grant access to the pages you want to export. We never see your password.
                    </p>
                </div>

                <button className="notion-connect-btn" onClick={onLogin}>
                    Continue with Notion
                </button>
            </div>
        </div>
    );
}
