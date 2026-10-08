import { OfflineBanner } from './components/StateView';
import { Sidebar } from './components/Sidebar';
import { ToastHost } from './components/Toast';
import { useOffline } from './hooks';
import { CategoryPage } from './pages/Category';
import { DetailPage } from './pages/Detail';
import { HomePage } from './pages/Home';
import { LibraryPage } from './pages/Library';
import { PlayerPage } from './pages/Player';
import { RankPage } from './pages/Rank';
import { SearchPage } from './pages/Search';
import { useHashRoute } from './router';
import { ErrorView } from './components/StateView';

/**
 * 固定骨架：左侧导航 200px + 右侧内容区（interaction §3）。
 * 单窗口单路由（URL Hash），Player 为路由内切换不新开窗口。
 * OFFLINE：顶部横幅 + 非 Library 页叠 ERROR 态（interaction §5/§6）。
 */
export default function App() {
  const route = useHashRoute();
  const offline = useOffline();

  const renderPage = () => {
    if (offline && route.name !== 'library') {
      return <ErrorView code={504} />;
    }
    switch (route.name) {
      case 'category':
        return <CategoryPage />;
      case 'rank':
        return <RankPage />;
      case 'search':
        return <SearchPage />;
      case 'library':
        return <LibraryPage />;
      case 'detail':
        return route.id ? <DetailPage key={route.id} id={route.id} /> : <HomePage />;
      case 'player':
        return route.id ? (
          <PlayerPage key={`${route.id}:${route.ep ?? 1}`} id={route.id} ep={route.ep ?? 1} />
        ) : (
          <HomePage />
        );
      case 'home':
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar active={route.name} offline={offline} />
      <main className="content">
        {offline && <OfflineBanner />}
        {renderPage()}
        <ToastHost />
      </main>
    </div>
  );
}
