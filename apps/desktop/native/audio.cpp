// Process-loopback capture follows the Windows ApplicationLoopback sample API pattern.
// https://learn.microsoft.com/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>
#include <wrl/implements.h>
#include <cstdio>
#include <cstdlib>
#include <vector>

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::FtmBase;
using Microsoft::WRL::Make;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;

class ActivationHandler final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase, IActivateAudioInterfaceCompletionHandler> {
 public:
  explicit ActivationHandler(HANDLE completed) : completed_(completed) {}
  HRESULT result = E_FAIL;
  ComPtr<IAudioClient> client;

  IFACEMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    ComPtr<IUnknown> unknown;
    HRESULT activation = E_FAIL;
    result = operation->GetActivateResult(&activation, unknown.GetAddressOf());
    if (SUCCEEDED(result)) result = activation;
    if (SUCCEEDED(result)) result = unknown.As(&client);
    SetEvent(completed_);
    return S_OK;
  }
 private:
  HANDLE completed_;
};

static int fail(const char* stage, HRESULT result) {
  std::fprintf(stderr, "%s (0x%08lx)\n", stage, static_cast<unsigned long>(result));
  return 1;
}

int wmain(int argc, wchar_t** argv) {
  if (argc != 2) return fail("ID da janela ausente", E_INVALIDARG);
  wchar_t* end = nullptr;
  unsigned long long id = _wcstoui64(argv[1], &end, 10);
  if (!id || !end || *end != L'\0') return fail("ID da janela inválido", E_INVALIDARG);
  HWND hwnd = reinterpret_cast<HWND>(static_cast<uintptr_t>(id));
  if (!IsWindow(hwnd)) return fail("Janela não encontrada", E_INVALIDARG);
  DWORD processId = 0;
  if (!GetWindowThreadProcessId(hwnd, &processId) || !processId) return fail("Processo da janela indisponível", E_FAIL);

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return fail("Falha ao iniciar COM", hr);
  HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!ready) return fail("Falha ao criar evento de áudio", HRESULT_FROM_WIN32(GetLastError()));
  auto handler = Make<ActivationHandler>(ready);
  if (!handler) return fail("Falha ao preparar captura", E_OUTOFMEMORY);

  AUDIOCLIENT_ACTIVATION_PARAMS params{};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = processId;
  params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
  PROPVARIANT variant{};
  variant.vt = VT_BLOB;
  variant.blob.cbSize = sizeof(params);
  variant.blob.pBlobData = reinterpret_cast<BYTE*>(&params);
  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &variant, handler.Get(), &operation);
  if (FAILED(hr)) return fail("Captura por aplicativo indisponível", hr);
  if (WaitForSingleObject(ready, 8000) != WAIT_OBJECT_0) return fail("Tempo esgotado na captura", E_ABORT);
  CloseHandle(ready);
  if (FAILED(handler->result)) return fail("Falha ao abrir áudio do aplicativo", handler->result);

  WAVEFORMATEX format{};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = 2;
  format.nSamplesPerSec = 44100;
  format.wBitsPerSample = 16;
  format.nBlockAlign = 4;
  format.nAvgBytesPerSec = 176400;
  HANDLE sampleReady = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!sampleReady) return fail("Falha ao criar evento de amostra", HRESULT_FROM_WIN32(GetLastError()));
  hr = handler->client->Initialize(AUDCLNT_SHAREMODE_SHARED,
      AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
      0, 0, &format, nullptr);
  if (FAILED(hr)) return fail("Formato de áudio não suportado", hr);
  hr = handler->client->SetEventHandle(sampleReady);
  if (FAILED(hr)) return fail("Falha ao sinalizar áudio", hr);
  ComPtr<IAudioCaptureClient> capture;
  hr = handler->client->GetService(IID_PPV_ARGS(&capture));
  if (FAILED(hr)) return fail("Falha ao abrir buffer de áudio", hr);
  hr = handler->client->Start();
  if (FAILED(hr)) return fail("Falha ao iniciar captura de áudio", hr);
  std::fprintf(stderr, "READY\n");
  std::fflush(stderr);
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  std::vector<BYTE> silence;
  for (;;) {
    DWORD wait = WaitForSingleObject(sampleReady, 1000);
    if (wait == WAIT_FAILED) break;
    if (wait == WAIT_TIMEOUT) continue;
    UINT32 frames = 0;
    while (SUCCEEDED(capture->GetNextPacketSize(&frames)) && frames > 0) {
      BYTE* data = nullptr;
      DWORD flags = 0;
      hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;
      DWORD bytes = frames * format.nBlockAlign;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        silence.assign(bytes, 0);
        data = silence.data();
      }
      DWORD written = 0;
      BOOL ok = WriteFile(output, data, bytes, &written, nullptr);
      capture->ReleaseBuffer(frames);
      if (!ok || written != bytes) {
        handler->client->Stop();
        CloseHandle(sampleReady);
        CoUninitialize();
        return fail("Canal de áudio encerrado", E_ABORT);
      }
    }
    if (FAILED(hr)) break;
  }
  handler->client->Stop();
  CloseHandle(sampleReady);
  CoUninitialize();
  return fail("Captura de áudio interrompida", hr);
}
