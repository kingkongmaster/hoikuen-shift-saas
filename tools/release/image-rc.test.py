import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('rc', Path(__file__).with_name('image-rc.py'))
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)


def saved_image(path, filenames):
    layer = io.BytesIO()
    with tarfile.open(fileobj=layer, mode='w') as out:
        for name, data in filenames:
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            out.addfile(entry, io.BytesIO(data))
    with tarfile.open(path, 'w') as out:
        for name, data in [('manifest.json', json.dumps([{'Layers': ['layer.tar']}]).encode()), ('layer.tar', layer.getvalue())]:
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            out.addfile(entry, io.BytesIO(data))


class RcSafety(unittest.TestCase):
    def test_high_unknown_and_secret_are_fail_closed_without_content(self):
        value = rc.vulnerabilities({'Results': [{'Secrets': [{'Match': 'DO_NOT_PUBLISH'}], 'Vulnerabilities': [
            {'Severity': 'HIGH', 'VulnerabilityID': 'TEST-1', 'Title': 'PRIVATE_DETAIL'},
            {'Severity': 'UNKNOWN', 'VulnerabilityID': 'TEST-2'}, {'Severity': 'LOW'}]}]})
        self.assertFalse(value['pass'])
        self.assertEqual(value['unclassified'], 2)
        self.assertEqual(value['secretCount'], 1)
        self.assertNotIn('DO_NOT_PUBLISH', json.dumps(value))
        self.assertNotIn('PRIVATE_DETAIL', json.dumps(value))

    def test_clean_scan(self):
        self.assertTrue(rc.vulnerabilities({'Results': []})['pass'])

    def test_missing_scanner_results_are_not_pass(self):
        with self.assertRaises(ValueError):
            rc.vulnerabilities({'error': 'scanner unavailable'})

    def test_deleted_maps_and_private_paths_still_block(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'image.tar'
            saved_image(path, [('app/dist/a.js.map', b'{}'), ('app/dist/.wh.a.js.map', b''), ('app/private.dump', b'no data')])
            value = rc.layer_boundary(path)
            self.assertFalse(value['pass'])
            self.assertEqual(value['sourceMaps'], 2)
            self.assertEqual(value['forbiddenFiles'], 1)

    def test_app_contact_candidates_count_only(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'image.tar'
            saved_image(path, [('app/dist/a.js', b'anonymous-test@gmail.com')])
            value = rc.layer_boundary(path)
            self.assertFalse(value['pass'])
            self.assertEqual(value['personalContactCandidates'], 1)
            self.assertNotIn('@', json.dumps(value))

    def test_size_cap_before_upload(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'large'
            with path.open('wb') as out:
                out.truncate(rc.MAX_ARTIFACT_BYTES + 1)
            self.assertFalse(rc.artifact_size_ok([path]))

    def test_workflow_boundaries(self):
        import yaml
        path = Path(__file__).parents[2] / '.github/workflows/image-rc.yml'
        workflow = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
        self.assertEqual(list(workflow['on']), ['workflow_dispatch'])
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        self.assertEqual(len(workflow['jobs']), 1)
        job = workflow['jobs']['image-rc']
        self.assertEqual(job['runs-on'], 'ubuntu-24.04')
        self.assertEqual(job['timeout-minutes'], '45')
        self.assertIn('github.event.repository.private == false', job['if'])
        text = path.read_text()
        for forbidden in ['secrets.', 'packages: write', 'deployments: write', 'cache-to', 'self-hosted', 'pull_request_target']:
            self.assertNotIn(forbidden, text)
        for step in job['steps']:
            if 'uses' in step:
                self.assertRegex(step['uses'], r'@[a-f0-9]{40}$')
            if 'run' in step:
                self.assertNotIn('${{', step['run'])
        upload = job['steps'][-1]
        self.assertEqual(upload['with']['retention-days'], '1')
        self.assertEqual(upload['with']['include-hidden-files'], 'false')


if __name__ == '__main__':
    unittest.main()
