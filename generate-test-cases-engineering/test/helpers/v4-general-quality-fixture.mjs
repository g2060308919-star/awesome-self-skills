import { v4PipelineFixture } from './v4-pipeline-fixture.mjs';
export { bindGeneralQualityFixture } from './v4-quality-binder.mjs';
export function v4GeneralQualityFixture(schemaVersion = '4.3.3') {
 const fixture = v4PipelineFixture();
 for (const artifact of Object.values(fixture.artifacts)) artifact.schema_version = schemaVersion;
 return fixture;
}
