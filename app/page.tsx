import AccountBridge from './AccountBridge';
import BrastaBootstrap from './BrastaBootstrap';

export default function Home() {
  return (
    <>
      <header className="brasta-site-nav">
        <div className="brasta-site-nav-inner">
          <a className="brasta-site-brand" href="/" aria-label="Brasta home">Brasta</a>
          <div className="brasta-site-nav-account-space" aria-hidden="true" />
        </div>
      </header>
      <BrastaBootstrap />
      <AccountBridge />
    </>
  );
}
