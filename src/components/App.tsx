import Layout from './Layout'
import Header from './Header'
import Footer from './Footer'
import { sentryIds, gaIds } from '../constants'

// Fixed pool of particle elements. They are pure static markup; CSS animates
// them as drifting particulate matter, with the density/opacity rising as the
// air quality worsens (body[data-aqi]). Per-:nth-child seeds provide the
// randomness.
const FX_PARTICLES = 30

interface AppProps {
  env?: 'stage' | 'production'
  lat: string
  lng: string
  v: string
}

const App = ({ env, lat, lng, v }: AppProps) => {
  const sentryId = env ? sentryIds[env] : ''
  const gaId = env ? gaIds[env] : ''
  return (
    <Layout sentryId={sentryId} gaId={gaId} v={v}>
      <div class='content playing'>
        <div class='air-fx' aria-hidden='true'>
          {Array.from({ length: FX_PARTICLES }).map(() => <span class='fx-p' />)}
        </div>
        <Header v={v} />
        <Footer v={v} />
      </div>
      <span id='location-data' data-location-lat={lat} data-location-lng={lng} />
    </Layout>
  )
}

export default App
