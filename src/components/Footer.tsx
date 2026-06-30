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

    <aside class="cta-wrap anim" style="--d: 520ms">
      <div class="upgrade-banner">
        <span class="cta-msg" id="cta-msg">Powerful, secure, simple digital signage</span>
        <span class="cta-lockup">
          <img class="cta-logo" src="/static/images/screenly-logo.svg?v=${props.v}" alt="Screenly" width="178" height="40" />
          <span class="cta-url">screenly.io</span>
        </span>
      </div>
    </aside>
  </div>

  <footer id="aqi-item-list"></footer>

  <div class="aqi-item dummy-node">
    <span class="item-time"></span>
    <span class="item-aqi"></span>
  </div>
  `

export default Footer
