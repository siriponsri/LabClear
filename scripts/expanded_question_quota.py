"""Run-scoped iApp decision admission from typed questions and permutations.

Existing production conservative label counting is unchanged. Only exact small
questions used by the safety adapter are supported; unknown shapes fail closed.
"""
def typed_decisions(body):
    questions=body.get('questions')
    if not isinstance(questions,dict) or not questions:raise ValueError('missing typed questions')
    permutations=body.get('permutations',1)
    if type(permutations) is not int or not 1<=permutations<=16:raise ValueError('invalid permutations')
    if body.get('order_invariant') and 'permutations' not in body:raise ValueError('unknown automatic permutations')
    for q in questions.values():
        if not isinstance(q,dict) or q.get('type') not in {'choice','score','noul'}:raise ValueError('unknown decision shape')
        if q.get('type') in {'choice','score'}:
            labels=q.get('criteria')
            if not isinstance(labels,(dict,list)) or not 2<=len(labels)<=10:raise ValueError('automatic order invariance unsupported')
    return len(questions)*permutations

def install():
    from services import free_policy
    from services.conversation_transport import ConversationError
    def count(body):
        try:return typed_decisions(body)
        except ValueError as exc:raise ConversationError('quota_shape_unknown',str(exc),409) from None
    free_policy.decisions=count
