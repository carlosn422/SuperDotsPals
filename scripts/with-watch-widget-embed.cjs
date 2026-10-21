const fs = require('fs');
const path = require('path');
const { withFinalizedMod, IOSConfig } = require('expo/config-plugins');

// @bacons/apple-targets embeds a watchOS widget extension into the watch app only when the watch app
// target already exists at the moment the extension target is created; otherwise it falls back to the
// iPhone app's "Embed Foundation Extensions" phase and simulator/device install fails. Targets are
// created in directory glob order, so after every other mod has written the project we move any
// watchOS app-extension embed (and its target dependency) from the iPhone app to the watch app.
function resolveXcodeJson() {
  const appleTargets = path.dirname(require.resolve('@bacons/apple-targets/package.json'));
  return require(require.resolve('@bacons/xcode/json', { paths: [appleTargets] }));
}

function settingsOf(objects, target) {
  const list = objects[target.buildConfigurationList];
  return (list?.buildConfigurations || []).map((id) => objects[id]?.buildSettings || {});
}

function isWatchOS(objects, target) {
  return settingsOf(objects, target).some((s) => s.SDKROOT === 'watchos' || 'WATCHOS_DEPLOYMENT_TARGET' in s);
}

function newId(objects) {
  let id;
  do {
    id = Array.from({ length: 24 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
  } while (objects[id]);
  return id;
}

function fixProject(project) {
  const objects = project.objects;
  const targets = objects[project.rootObject].targets.map((id) => [id, objects[id]]).filter(([, t]) => t?.isa === 'PBXNativeTarget');
  const watchApp = targets.find(([, t]) => t.productType === 'com.apple.product-type.application' && isWatchOS(objects, t));
  const extensions = targets.filter(([, t]) => t.productType === 'com.apple.product-type.app-extension' && isWatchOS(objects, t));
  if (!watchApp || !extensions.length) return 0;
  const [watchId, watch] = watchApp;
  let moved = 0;
  for (const [extId, ext] of extensions) {
    const buildFiles = [];
    for (const [ownerId, owner] of targets) {
      if (ownerId === watchId) continue;
      for (const phaseId of owner.buildPhases || []) {
        const phase = objects[phaseId];
        if (phase?.isa !== 'PBXCopyFilesBuildPhase') continue;
        const keep = [];
        for (const fileId of phase.files || []) {
          if (objects[fileId]?.fileRef === ext.productReference) buildFiles.push(fileId);
          else keep.push(fileId);
        }
        phase.files = keep;
      }
      const deps = owner.dependencies || [];
      const extDeps = deps.filter((d) => objects[d]?.target === extId);
      if (extDeps.length) {
        owner.dependencies = deps.filter((d) => !extDeps.includes(d));
        watch.dependencies = [...new Set([...(watch.dependencies || []), ...extDeps])];
      }
    }
    if (!buildFiles.length) continue;
    let embedId = (watch.buildPhases || []).find((id) => objects[id]?.isa === 'PBXCopyFilesBuildPhase' && String(objects[id].dstSubfolderSpec) === '13');
    if (!embedId) {
      embedId = newId(objects);
      objects[embedId] = { isa: 'PBXCopyFilesBuildPhase', buildActionMask: 2147483647, dstPath: '', dstSubfolderSpec: 13, files: [], name: 'Embed Foundation Extensions', runOnlyForDeploymentPostprocessing: 0 };
      watch.buildPhases = [...(watch.buildPhases || []), embedId];
    }
    const embed = objects[embedId];
    const already = (embed.files || []).some((id) => objects[id]?.fileRef === ext.productReference);
    if (!already) embed.files = [...(embed.files || []), buildFiles[0]];
    for (const extra of buildFiles.slice(already ? 0 : 1)) delete objects[extra];
    moved++;
  }
  return moved;
}

module.exports = function withWatchWidgetEmbed(config) {
  return withFinalizedMod(config, ['ios', async (c) => {
    const file = IOSConfig.Paths.getPBXProjectPath(c.modRequest.projectRoot);
    const xcodeJson = resolveXcodeJson();
    const project = xcodeJson.parse(fs.readFileSync(file, 'utf8'));
    const moved = fixProject(project);
    if (moved) {
      fs.writeFileSync(file, xcodeJson.build(project));
      console.log(`[with-watch-widget-embed] Embedded ${moved} watchOS extension(s) in the watch app`);
    }
    return c;
  }]);
};
module.exports.fixProject = fixProject;
