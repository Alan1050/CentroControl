import './Header.css'
import logo from '../assets/Logo Neuro.png'

function Header() {
  return (
    <header className="site-header">
      <div className="header-container">
        <div className="header-identity">
          <img src={logo} alt="" className="header-logo" />
          <div>
            <p className="header-title">NeuroOrbit <span>Lab</span></p>
          </div>
        </div>
        <div className="header-label">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 12h4l3-6 4 12 3-6h4" />
          </svg>
          Panel biométrico
        </div>
      </div>
    </header>
  )
}

export default Header
