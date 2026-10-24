<?php
declare(strict_types=1);
namespace Ekwl;
function notesAction(array $u,array $b): array {
    $owner=$u['auth_user_id'];$action=$b['action']??'list';
    if($action==='list')return ['notes'=>run('SELECT id,title,content,updated_at FROM ekwl_notes WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100',[$owner])->fetchAll()];
    $id=(string)($b['id']??'');
    if($action==='save'){
        $title=trim((string)($b['title']??''));$content=(string)($b['content']??'');
        if(!$title||strlen($title)>255||strlen($content)>60000)throw new ApiError('Note title/content exceed limits.');
        return transaction(function()use($id,$title,$content,$owner){
            if($id){$exists=run('SELECT id FROM ekwl_notes WHERE id=? AND owner_id=? FOR UPDATE',[$id,$owner])->fetchColumn();if(!$exists)throw new ApiError('Note not found.',404);
                run('UPDATE ekwl_notes SET title=?,content=?,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND owner_id=?',[$title,$content,$id,$owner]);
            }else{$id=uuid();run('INSERT INTO ekwl_notes VALUES (?,?,?,?,UTC_TIMESTAMP(6))',[$id,$owner,$title,$content]);}
            audit('note.save',$id);return ['id'=>$id];
        });
    }
    if($action==='delete'){
        $s=run('DELETE FROM ekwl_notes WHERE id=? AND owner_id=?',[$id,$owner]);if(!$s->rowCount())throw new ApiError('Note not found.',404);
        audit('note.delete',$id);return ['success'=>true];
    }
    throw new ApiError('Unknown note operation.');
}
