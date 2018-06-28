import Head from 'next/head'
import Header from '../components/Header'

export default () => (
  <div>
    <Head>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/6.26.0/polyfill.min.js" />
    </Head>
    <Header />
    <p>HOME PAGE is here!</p>
  </div>
)
