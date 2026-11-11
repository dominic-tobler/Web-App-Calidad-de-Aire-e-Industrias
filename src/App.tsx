import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'
import { ScatterPlot } from './ScatterPlot'


const sampleData = [
  { id: 'p1', x: 10, y: 25 },
  { id: 'p2', x: 30, y: 50 },
  { id: 'p3', x: 45, y: 35 },
  { id: 'p4', x: 70, y: 80 },
  { id: 'p5', x: 90, y: 65 },
];

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <section id="center">
        <section id="spacer"></section>
        <h2>Example of incorporating an image asset</h2>
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>

        <div className="ticks"></div>
        <section id="spacer"></section>
      </section>

      <section id="center">
        <h2>State example using a Counter</h2>
        <p>{count}</p>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Click me
        </button>
      </section>

      <section id="center">
        <div className="ticks"></div>
        <section id="spacer"></section>

        <h2>Sample Visualization in D3</h2>
        <ScatterPlot data={sampleData} />
      </section>
    </>
  )
}

export default App
