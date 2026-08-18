#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdlib>
#include <iostream>

int wmain(int argc, wchar_t** argv) {
  if (argc != 2) return 2;
  const int vk = _wtoi(argv[1]);
  if (vk <= 0 || vk > 0xFF) return 2;

  bool lastDown = false;
  for (;;) {
    const bool down = (GetAsyncKeyState(vk) & 0x8000) != 0;
    if (down != lastDown) {
      std::cout << (down ? "D\n" : "U\n") << std::flush;
      lastDown = down;
    }
    Sleep(4);
  }
}
