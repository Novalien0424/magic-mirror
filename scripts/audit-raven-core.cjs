// Structural audit only. Run from the repository root; no WebGL or Electron.
const fs = require('node:fs')
const vm = require('node:vm')

const context = {
  atob, btoa, console, WebAssembly, Uint8Array, ArrayBuffer,
  TextDecoder, TextEncoder, setTimeout, clearTimeout, performance,
}
vm.createContext(context)
vm.runInContext(fs.readFileSync('src/vendor/live2d/Core/live2dcubismcore.min.js', 'utf8'), context)

// Give the embedded WASM module its initialization turn before querying Core.
setTimeout(() => {
  let moc, model
  try {
    const core = context.Live2DCubismCore
    const bytes = Uint8Array.from(fs.readFileSync('resources/avatar/Raven/v11/runtime/raven-lord.moc3')).buffer
    moc = core.Moc.fromArrayBuffer(bytes)
    model = core.Model.fromMoc(moc)
    model.update()
    const names = model.parameters.ids
    const doc = {
      parameters: names.map((id, index) => ({
        id,
        min: model.parameters.minimumValues[index],
        max: model.parameters.maximumValues[index],
        default: model.parameters.defaultValues[index],
      })),
      drawables: model.drawables.ids,
      parameterEffects: {},
    }
    const snapshot = () => ({
      opacity: Array.from(model.drawables.opacities),
      vertices: model.drawables.vertexPositions.map(vertices => Array.from(vertices)),
    })
    for (const id of ['ParamEyeLOpen', 'ParamEyeROpen', 'ParamMouthOpenY', 'ParamAngleX', 'ParamBreath']) {
      model.parameters.values.set(model.parameters.defaultValues)
      model.parameters.values[names.indexOf(id)] = 0
      model.update()
      const a = snapshot()
      model.parameters.values[names.indexOf(id)] = id === 'ParamAngleX' ? 2 : 1
      model.update()
      const b = snapshot()
      doc.parameterEffects[id] = model.drawables.ids.filter((_, index) =>
        Math.abs(a.opacity[index] - b.opacity[index]) > 1e-6
        || a.vertices[index].some((value, vertex) => Math.abs(value - b.vertices[index][vertex]) > 1e-6))
    }
    fs.writeFileSync('resources/avatar/Raven/v11/CORE-AUDIT.json', JSON.stringify(doc, null, 2) + '\n')
    console.log(JSON.stringify({
      parameterCount: names.length, drawableCount: model.drawables.ids.length,
      effects: doc.parameterEffects,
    }))
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    model?.release()
    moc?._release()
  }
}, 100)
