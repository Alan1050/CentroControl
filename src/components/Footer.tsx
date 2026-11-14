import './Footer.css'

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-identity">
          <p className="footer-brand">NeuroOrbit <span>Lab</span></p>
          <h2 id="collaborators-title">Equipo del proyecto</h2>
        </div>
        <ul className="footer-collaborators" aria-labelledby="collaborators-title">
          <li>Iris Anahi Vargas Brambila</li>
          <li>Kevin Yahir Bernal Aguirre</li>
          <li>
            <a href="https://devalanmedina.netlify.app/" target="_blank" rel="noopener noreferrer">
              Alan Emir Medina Delgado <span aria-hidden="true">↗</span>
            </a>
          </li>
        </ul>
      </div>
    </footer>
  )
}

export default Footer
