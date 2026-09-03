"""One cv2/numpy probe for every board-exposure test file.

Until 31/08/2026 three test files each carried their own copy of
_stub_if_missing, and the copies poisoned each other under
`unittest discover`: all files share one process, so the first file to
run stubbed the missing numpy with an EMPTY module, and the next file's
probe then found that stub in sys.modules, declared numpy present, and
ran its real-numpy tests against a module with no attributes — 39
AttributeErrors on every CI run, while any machine with numpy installed
stayed green. Each copy was correct alone; together they lied.

So the probe lives once, here, and answers two ways a module can be
unusable: it does not import, or what imports is a stub (ours carries
_nl_stub; any impostor is caught by the attribute probe — an empty
module has no ndarray). The stubs still get installed, because the
engine scripts import cv2/numpy at module top and must load far enough
for their pure-python pieces to be tested.

Not named test_*.py, so discovery never collects it.
"""
import sys
import types


def _usable(name, probe):
    try:
        mod = __import__(name)
    except ImportError:
        stub = types.ModuleType(name)
        stub._nl_stub = True
        sys.modules[name] = stub
        return False
    return not getattr(mod, "_nl_stub", False) and hasattr(mod, probe)


_np = _usable("numpy", "ndarray")
_cv = _usable("cv2", "matchTemplate")
HAVE_CV = _np and _cv
