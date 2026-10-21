#include "uvc-payload-audit.hpp"
#include <array>
#include <cassert>
#include <iostream>
#include <vector>
using mirror::camera_research::PayloadAudit;

int main() {
  const std::array<std::uint8_t, 6> first{2, 0x80, 0, 0, 0, 0};
  auto last = first; last[1] = 0x82;
  PayloadAudit clean(8);
  clean.observe(0, first.data(), first.size()); clean.observe(0, last.data(), last.size());
  assert(clean.counters().sizedCandidatesWithEof == 1);
  auto next = last; next[1] = 0x83;
  clean.observe(0, next.data(), next.size());
  assert(clean.counters().fidTransitions == 1 && clean.counters().damagedOrWrongSizedFrames == 1);

  PayloadAudit transport(8);
  transport.observe(0, nullptr, 0); transport.observe(-1, nullptr, 100);
  transport.observe(0, first.data(), first.size()); transport.observe(0, last.data(), last.size());
  assert(transport.counters().emptyPayloads == 1 && transport.counters().transportErrors == 1);
  assert(transport.counters().sizedCandidatesWithEof == 0);

  PayloadAudit malformed(8);
  malformed.observe(0, nullptr, 3); malformed.observe(0, first.data(), 1);
  auto bad = first; bad[0] = 1; malformed.observe(0, bad.data(), bad.size());
  bad[0] = 20; malformed.observe(0, bad.data(), bad.size());
  bad[0] = 2; bad[1] = 0x8c; malformed.observe(0, bad.data(), bad.size());
  assert(malformed.counters().shortHeaders == 2 && malformed.counters().invalidHeaderLengths == 2);
  assert(malformed.counters().truncatedClockHeaders == 1);

  PayloadAudit errors(8);
  auto device = first; device[1] = 0xc0;
  errors.observe(0, device.data(), device.size()); errors.observe(0, last.data(), last.size());
  assert(errors.counters().deviceErrors == 1 && errors.counters().sizedCandidatesWithEof == 0);
  PayloadAudit noEoh(8); device[1] = 0;
  noEoh.observe(0, device.data(), device.size()); noEoh.observe(0, last.data(), last.size());
  assert(noEoh.counters().missingEndOfHeader == 1 && noEoh.counters().sizedCandidatesWithEof == 0);

  PayloadAudit boundaries(8);
  boundaries.observe(0, first.data(), first.size()); boundaries.observe(0, first.data(), first.size());
  boundaries.observe(0, next.data(), next.size());
  assert(boundaries.counters().sizedCandidatesAtFid == 1);
  PayloadAudit oversize(3); oversize.observe(0, last.data(), last.size());
  assert(oversize.counters().frameOverflowPayloads == 1 && oversize.counters().sizedCandidatesWithEof == 0);
  PayloadAudit repeatedOverflow(3);
  repeatedOverflow.observe(0, first.data(), first.size()); repeatedOverflow.observe(0, last.data(), last.size());
  assert(repeatedOverflow.counters().frameOverflowPayloads == 2
    && repeatedOverflow.counters().damagedOrWrongSizedFrames == 1);
  PayloadAudit unfinished(8); unfinished.observe(0, first.data(), first.size()); unfinished.endStream();
  assert(unfinished.counters().damagedOrWrongSizedFrames == 1);

  // Synthetic bounded fuzz sweep under ASan/UBSan. No camera data is consumed.
  PayloadAudit fuzz(153600); std::array<std::uint8_t, 32> bytes{};
  for (unsigned header = 0; header < 256; ++header) for (unsigned flags = 0; flags < 256; ++flags) {
    bytes[0] = static_cast<std::uint8_t>(header); bytes[1] = static_cast<std::uint8_t>(flags);
    fuzz.observe(0, bytes.data(), flags % 33);
  }
  fuzz.endStream();
  bool rejected = false; try { PayloadAudit invalid(0); } catch (const std::invalid_argument&) { rejected = true; }
  assert(rejected);
  std::cout << "uvc_payload_audit passed synthetic_only fuzz_cases=65536 image_retention=none\n";
}
