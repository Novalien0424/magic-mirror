#include <stdint.h>

// No identifiers, frames or driver messages leave this boundary.
// 0 success; 1 absent; 2 ambiguous; 3 access; 4 open; 5 reset failed.
int mirror_camera_usb_reset(uint32_t location, uint16_t vendor, uint16_t product);
