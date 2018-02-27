import {join} from 'path'
import {writeFile} from 'mz/fs'

export default class BuildStatsPlugin {
  apply (compiler) {
    const {path: outputPath, publicPath} = compiler.options.output

    const filename = join(outputPath, 'build-stats.json')
    compiler.plugin('done', async (stats) => {
      const assetMap = {}

      for (const chunk of stats.compilation.chunks) {
        if (!chunk.name || !chunk.files) {
          continue
        }

        const files = []

        for (const file of chunk.files) {
          if (!/\.js$/.test(file)) {
            continue
          }

          if (/\.hot-update\.js$/.test(file)) {
            continue
          }

          files.push(`${publicPath}${file}`)
        }

        if (files.length > 0) {
          assetMap[chunk.name] = files
        }
      }

      await writeFile(filename, JSON.stringify(assetMap), 'utf8')
    })
  }
}
