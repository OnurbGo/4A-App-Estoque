import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { QUALIDADE_JPEG, redimensionamento } from '@/regras/foto';

const PASTA_DAS_FOTOS = 'anexos';

/** Na pasta de documentos: o Android pode limpar o cache antes de a foto ser enviada. */
function pastaDasFotos(): Directory {
  const pasta = new Directory(Paths.document, PASTA_DAS_FOTOS);
  pasta.create({ idempotent: true, intermediates: true });
  return pasta;
}

export type FotoTirada = { uri: string; largura: number; altura: number };

/** Devolve `null` se a pessoa desistiu ou não deu permissão para a câmera. */
export async function tirarFoto(): Promise<FotoTirada | null> {
  const { granted } = await ImagePicker.requestCameraPermissionsAsync();
  if (!granted) return null;

  const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  const [foto] = resultado.assets ?? [];
  if (resultado.canceled || !foto) return null;

  return { uri: foto.uri, largura: foto.width, altura: foto.height };
}

/** Lado maior de 1600 px, JPEG 70%, e guarda com o `client_id` da foto. */
export async function guardarFoto(foto: FotoTirada, clientId: string): Promise<string> {
  const contexto = ImageManipulator.manipulate(foto.uri);
  const tamanho = redimensionamento(foto.largura, foto.altura);
  if (tamanho) contexto.resize(tamanho);

  const imagem = await contexto.renderAsync();
  const { uri } = await imagem.saveAsync({ format: SaveFormat.JPEG, compress: QUALIDADE_JPEG });

  const destino = new File(pastaDasFotos(), `${clientId}.jpg`);
  new File(uri).move(destino);
  return destino.uri;
}

export function fotoExiste(caminho: string): boolean {
  return new File(caminho).exists;
}

export function apagarFoto(caminho: string): void {
  const arquivo = new File(caminho);
  if (arquivo.exists) arquivo.delete();
}
