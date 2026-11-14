import './App.css'
import type { BloodPressureReading } from './components/BloodPressureChart.tsx'
import Card from './components/Card.tsx'
import Footer from './components/Footer.tsx'
import Header from './components/Header.tsx'

const astronautIds = ['A', 'B', 'C'] as const

// Agregar aquí las lecturas de cada astronauta cuando se conecte la fuente de datos.
const bloodPressureReadings: Record<typeof astronautIds[number], BloodPressureReading[]> = {
  A: [],
  B: [],
  C: [],
}

function App() {
  return (
    <div className="app-shell">
      <Header />

      <main className="main-content">
        <div className="page-heading">
          <div>
            <h1>Centro de control</h1>
          </div>
        </div>

        <section id="Datos" className="datos-container" aria-label="Datos de los astronautas">
          {astronautIds.map((id, index) => (
            <Card key={id} astronautId={id} position={index + 1} readings={bloodPressureReadings[id]} />
          ))}
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default App
