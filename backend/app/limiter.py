from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared Limiter instance. Lives in its own module (rather than main.py) so
# routers can import it as a decorator without creating a circular import
# with main.py (which imports the routers).
limiter = Limiter(key_func=get_remote_address)
