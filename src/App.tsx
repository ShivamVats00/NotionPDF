import { useAuth } from './hooks/useAuth';
import { usePages } from './hooks/usePages';
import { useDownload } from './hooks/useDownload';
import { Layout } from './components/Layout';
import { AuthCard } from './components/AuthCard';
import { PageList } from './components/PageList';
import './index.css';

export default function App() {
    const { user, setUser, isLoadingUser, setIsLoadingUser, handleDisconnect, handleLogin } = useAuth();
    const { pages, isLoadingPages, pagesError, fetchPages } = usePages(user, setIsLoadingUser);
    const { downloadProgress, downloadErrors, handleDownloadPage, clearDownloads } = useDownload(setUser);

    if (isLoadingUser) {
        return (
            <Layout>
                <div className="spinner-large" />
            </Layout>
        );
    }

    if (!user) {
        return (
            <Layout>
                <AuthCard onLogin={handleLogin} />
            </Layout>
        );
    }

    return (
        <Layout>
            <PageList
                user={user}
                pages={pages}
                isLoadingPages={isLoadingPages}
                pagesError={pagesError}
                fetchPages={fetchPages}
                onDisconnect={() => handleDisconnect(clearDownloads)}
                onDownload={handleDownloadPage}
                downloadProgress={downloadProgress}
                downloadErrors={downloadErrors}
            />
        </Layout>
    );
}