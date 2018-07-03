import App, {Container} from 'next/app'
import React from 'react'
import PropTypes from 'prop-types';

export default class MyApp extends App {
  static childContextTypes = {
    router: PropTypes.object,
  };

  getChildContext() {
    const { router } = this.props;
    return { router };
  }

  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return {pageProps}
  }

  render () {
    const {Component, pageProps} = this.props
    return <Container>
      <Component {...pageProps} />
    </Container>
  }
}
