// Diagnostic building block, not a driver. Original implementation; no USB I/O.
#pragma once
#include <cstddef>
#include <cstdint>
#include <stdexcept>

namespace mirror::camera_research {
struct PayloadCounters {
  std::uint64_t payloads = 0, transportErrors = 0, emptyPayloads = 0;
  std::uint64_t shortHeaders = 0, invalidHeaderLengths = 0, truncatedClockHeaders = 0;
  std::uint64_t deviceErrors = 0, missingEndOfHeader = 0, frameOverflowPayloads = 0;
  std::uint64_t fidTransitions = 0, eofMarkers = 0, repeatedFidAfterEof = 0;
  std::uint64_t sizedCandidatesWithEof = 0, sizedCandidatesAtFid = 0;
  std::uint64_t damagedOrWrongSizedFrames = 0;
};

// Feed ONE complete UVC payload, not each physical USB high-bandwidth transaction.
// The transport adapter must validate actual byte counts and grouping first.
// Only the fixed header is inspected. No payload bytes, pointers, clocks or images
// are retained. Exact byte size applies to a verified uncompressed wire mode only.
class PayloadAudit {
 public:
  explicit PayloadAudit(std::size_t expectedFrameBytes) : expected_(expectedFrameBytes) {
    if (expected_ == 0 || expected_ > 16 * 1024 * 1024) throw std::invalid_argument("frame_size_invalid");
  }
  void observe(int transportStatus, const std::uint8_t* bytes, std::size_t length) {
    ++c_.payloads;
    if (transportStatus != 0) { ++c_.transportErrors; damaged_ = true; return; }
    if (length == 0) { ++c_.emptyPayloads; return; }
    if (!bytes || length < 2) { ++c_.shortHeaders; damaged_ = true; return; }
    const std::size_t header = bytes[0];
    if (header < 2 || header > length) { ++c_.invalidHeaderLengths; damaged_ = true; return; }
    const auto flags = bytes[1];
    const std::size_t required = 2 + ((flags & 0x04) ? 4 : 0) + ((flags & 0x08) ? 6 : 0);
    if (header < required) { ++c_.truncatedClockHeaders; damaged_ = true; return; }
    const bool fid = (flags & 1) != 0;
    if (seenFid_ && fid != fid_) {
      ++c_.fidTransitions;
      if (active_) finish(false);
    } else if (seenFid_ && !active_ && endedWithEof_) {
      ++c_.repeatedFidAfterEof;
    }
    if (!active_) { active_ = true; frameBytes_ = 0; endedWithEof_ = false; }
    seenFid_ = true; fid_ = fid;
    if (!(flags & 0x80)) { ++c_.missingEndOfHeader; damaged_ = true; }
    if (flags & 0x40) { ++c_.deviceErrors; damaged_ = true; }
    const std::size_t body = length - header;
    if (body > expected_ - frameBytes_) {
      ++c_.frameOverflowPayloads; damaged_ = true; frameBytes_ = expected_;
    } else frameBytes_ += body;
    if (flags & 0x02) { ++c_.eofMarkers; finish(true); }
  }
  PayloadCounters counters() const { return c_; }
  void endStream() { if (active_) { ++c_.damagedOrWrongSizedFrames; active_ = false; } }
 private:
  void finish(bool eof) {
    if (!damaged_ && frameBytes_ == expected_) {
      if (eof) ++c_.sizedCandidatesWithEof;
      else ++c_.sizedCandidatesAtFid;
    } else ++c_.damagedOrWrongSizedFrames;
    active_ = false; damaged_ = false; frameBytes_ = 0; endedWithEof_ = eof;
  }
  PayloadCounters c_;
  const std::size_t expected_;
  std::size_t frameBytes_ = 0;
  bool active_ = false, damaged_ = false, seenFid_ = false, fid_ = false, endedWithEof_ = false;
};
} // namespace mirror::camera_research
