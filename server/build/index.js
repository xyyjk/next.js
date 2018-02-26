import { join } from 'path'
import fs from 'mz/fs'
import uuid from 'uuid'
import webpack from 'webpack'
import getConfig from '../config'
import {PHASE_PRODUCTION_BUILD} from '../../lib/constants'
import getBaseWebpackConfig from './webpack'
// import md5File from 'md5-file/promise'

export default async function build (dir, conf = null) {
  const config = getConfig(PHASE_PRODUCTION_BUILD, dir, conf)
  const buildId = uuid.v4()

  try {
    await fs.access(dir, fs.constants.W_OK)
  } catch (err) {
    console.error(`> Failed, build directory is not writeable. https://err.sh/zeit/next.js/build-dir-not-writeable`)
    throw err
  }

  try {
    const configs = await Promise.all([
      getBaseWebpackConfig(dir, { buildId, isServer: false, config }),
      getBaseWebpackConfig(dir, { buildId, isServer: true, config })
    ])

    const stats = await runCompiler(configs)

    await writeBuildStats(stats, {dir, config})
    await writeBuildId(dir, buildId, config)
  } catch (err) {
    console.error(`> Failed to build`)
    throw err
  }
}

function runCompiler (compiler) {
  return new Promise(async (resolve, reject) => {
    const webpackCompiler = await webpack(await compiler)
    webpackCompiler.run((err, stats) => {
      if (err) return reject(err)

      const jsonStats = stats.toJson()

      if (jsonStats.errors.length > 0) {
        const error = new Error(jsonStats.errors[0])
        error.errors = jsonStats.errors
        error.warnings = jsonStats.warnings
        return reject(error)
      }

      resolve(jsonStats)
    })
  })
}

// Generates build-stats.json containing a mapping of entrypoint => output path
async function writeBuildStats (stats, {dir, config}) {
  const clientStats = stats.children.find(stat => stat.name === 'client')
  const assetMap = {}

  for (const chunk of clientStats.chunks) {
    if (!chunk.names || !chunk.files) {
      continue
    }

    const [name] = chunk.names // names is an array with 1 value

    assetMap[name] = chunk.files
  }
  const buildStatsPath = join(dir, config.distDir, 'build-stats.json')
  await fs.writeFile(buildStatsPath, JSON.stringify(assetMap), 'utf8')
}

async function writeBuildId (dir, buildId, config) {
  const buildIdPath = join(dir, config.distDir, 'BUILD_ID')
  await fs.writeFile(buildIdPath, buildId, 'utf8')
}
