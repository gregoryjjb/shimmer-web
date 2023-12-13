/* @refresh reload */
import { render } from 'solid-js/web'

import './index.css'
import App from './App'

import './tabbing'

const root = document.getElementById('root')

render(() => <App />, root!)
