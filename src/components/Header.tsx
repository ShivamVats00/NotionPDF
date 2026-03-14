export function Header({ subtitle }: { subtitle: string }) {
    return (
        <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
                <span className="text-3xl">⚡</span>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
                    Nox
                </h1>
            </div>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed max-w-sm mx-auto">
                {subtitle}
            </p>
        </div>
    );
}
