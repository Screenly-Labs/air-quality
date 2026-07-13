import { html } from 'hono/html'

interface FooterProps {
  v: string
}

const Footer = (props: FooterProps) => html`
  <div class="midrow">
    <section class="hero">
      <div class="aqi-condition anim" style="--d: 260ms">
        <span class="aqi-dot" id="aqi-dot"></span>
        <span id="aqi-category"></span>
      </div>
      <div class="aqi-readout">
        <span id="aqi-value" class="anim" style="--d: 200ms"></span>
        <span id="aqi-scale" class="anim" style="--d: 380ms"></span>
      </div>
      <p class="aqi-advice anim" id="aqi-advice" style="--d: 440ms"></p>
      <div class="detail anim" id="detail" style="--d: 500ms"></div>
    </section>

  </div>

  <a
    class="brand"
    href="https://www.screenly.io"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Screenly - opens in a new tab"
  >
    <img src="/static/images/screenly-logo.svg?v=${props.v}" alt="Screenly" />
  </a>

  <footer id="aqi-item-list"></footer>

  <div class="aqi-item dummy-node">
    <span class="item-time"></span>
    <span class="item-aqi"></span>
  </div>
  `

export default Footer
