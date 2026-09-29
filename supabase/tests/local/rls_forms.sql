\set ON_ERROR_STOP on
\set QUIET on
\set suite 'rls_forms'

begin;
set local search_path = public;
set local client_min_messages = warning;
\o /dev/null

\set owner_id    '51111111-1111-4111-8111-111111111111'
\set editor_id   '52222222-2222-4222-8222-222222222222'
\set viewer_id   '53333333-3333-4333-8333-333333333333'
\set stranger_id '54444444-4444-4444-8444-444444444444'
\set employee_id '55555555-5555-4555-8555-555555555555'
\set form_id     '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set plain_id    '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

insert into auth.users(id,email) values
  (:'owner_id','forms-owner@reid.test'),(:'editor_id','forms-editor@reid.test'),(:'viewer_id','forms-viewer@reid.test'),
  (:'stranger_id','forms-stranger@reid.test'),(:'employee_id','forms-employee@reid.test');
insert into public.user_roles(user_id,role) values
  (:'owner_id','admin'),(:'editor_id','admin'),(:'viewer_id','super_admin'),(:'stranger_id','admin'),(:'employee_id','employee');

-- Creating ------------------------------------------------------------------------
select test_sign_in(:'owner_id');
select t_allowed(:'suite','an administrator creates a form with a file question',format($$
  insert into public.forms(id,title,one_per_device,questions) values (%L,'تقييم الورشة',true,
  '[{"id":"name","type":"short","title":"الاسم","required":true},
    {"id":"mail","type":"email","title":"البريد"},
    {"id":"stars","type":"rating","title":"التقييم","max":5,"required":true},
    {"id":"pick","type":"choice","title":"الجلسة","options":[{"id":"a","label":"صباحية"},{"id":"b","label":"مسائية"}]},
    {"id":"page","type":"section","title":"صفحة"},
    {"id":"doc","type":"file","title":"ملف"}]')$$, :'form_id'));
select t_allowed(:'suite','an administrator creates a second form without files',format($$
  insert into public.forms(id,title,questions) values (%L,'حضور','[{"id":"name","type":"short","title":"الاسم"}]')$$, :'plain_id'));
select t_rejected(:'suite','nobody creates a form in another person''s name',format($$
  insert into public.forms(owner_id,title) values (%L,'x')$$, :'editor_id'));

select test_sign_in(:'employee_id');
select t_rejected(:'suite','an employee cannot create forms',$$insert into public.forms(title) values ('x')$$);

-- Sharing -------------------------------------------------------------------------
select test_sign_in(:'owner_id');
select t_allowed(:'suite','the owner shares with an administrator as editor',format($$
  insert into public.form_collaborators(form_id,user_id,role) values (%L,%L,'editor')$$, :'form_id', :'editor_id'));
select t_allowed(:'suite','the owner shares with a super admin as viewer',format($$
  insert into public.form_collaborators(form_id,user_id,role) values (%L,%L,'viewer')$$, :'form_id', :'viewer_id'));
select t_rejected(:'suite','a form cannot be shared with an employee',format($$
  insert into public.form_collaborators(form_id,user_id,role) values (%L,%L,'viewer')$$, :'form_id', :'employee_id'),'23514');
select t_rejected(:'suite','the owner cannot be added as their own collaborator',format($$
  insert into public.form_collaborators(form_id,user_id,role) values (%L,%L,'editor')$$, :'form_id', :'owner_id'),'23514');
select t_rejected(:'suite','only known roles are accepted',format($$
  insert into public.form_collaborators(form_id,user_id,role) values (%L,%L,'owner')$$, :'form_id', :'stranger_id'),'23514');

select test_sign_in(:'editor_id');
select t_rejected(:'suite','an editor cannot share the form further',format($$
  insert into public.form_collaborators(form_id,user_id,role) values (%L,%L,'viewer')$$, :'form_id', :'stranger_id'));
select t_changed(:'suite','an editor cannot promote a viewer',
  $$update public.form_collaborators set role='editor' where role='viewer'$$,0);

-- Reading and editing --------------------------------------------------------------
select test_sign_in(:'owner_id');
select t_visible(:'suite','the owner lists both forms','select 1 from public.forms',2);
select test_sign_in(:'editor_id');
select t_visible(:'suite','an editor lists only the shared form','select 1 from public.forms',1);
select t_changed(:'suite','an editor edits the questions and title',
  format($$update public.forms set title='تقييم الورشة الأولى' where id=%L$$, :'form_id'),1);
select t_rejected(:'suite','an editor cannot take ownership',
  format($$update public.forms set owner_id=%L where id=%L$$, :'editor_id', :'form_id'));
select t_changed(:'suite','an editor cannot delete the form',format($$delete from public.forms where id=%L$$, :'form_id'),0);
select test_sign_in(:'viewer_id');
select t_visible(:'suite','a viewer lists the shared form','select 1 from public.forms',1);
select t_changed(:'suite','a viewer cannot edit',format($$update public.forms set title='x' where id=%L$$, :'form_id'),0);
select test_sign_in(:'stranger_id');
select t_visible(:'suite','another administrator sees nothing unshared','select 1 from public.forms',0);
select t_changed(:'suite','another administrator cannot edit',format($$update public.forms set title='x' where id=%L$$, :'form_id'),0);
select test_sign_in(:'employee_id');
select t_visible(:'suite','an employee sees no forms','select 1 from public.forms',0);
select test_sign_out();
select t_visible(:'suite','a visitor cannot list forms','select 1 from public.forms',0);

-- Respondents ---------------------------------------------------------------------
select t_true(:'suite','a visitor opens the form by its link',format($$select public.public_form(%L)->>'title' = 'تقييم الورشة الأولى'$$, :'form_id'));
select t_true(:'suite','a visitor is not offered the management preview',format($$select (public.public_form(%L)->>'can_manage')::boolean$$, :'form_id'),false);
select t_true(:'suite','the public view leaves the owner out',format($$select not (public.public_form(%L) ? 'owner_id')$$, :'form_id'));
select t_allowed(:'suite','a visitor submits a valid response',format($$
  select public.submit_form_response(%L,'{"name":"سالم","mail":"s@example.com","stars":4,"pick":"صباحية"}','device-aaaaaaaaaaaaaaaa')$$, :'form_id'));
select t_rejected(:'suite','the same device cannot answer twice',format($$
  select public.submit_form_response(%L,'{"name":"سالم","stars":5}','device-aaaaaaaaaaaaaaaa')$$, :'form_id'),'23505');
select t_rejected(:'suite','a required answer cannot be skipped',format($$
  select public.submit_form_response(%L,'{"name":"  ","stars":4}','device-bbbbbbbbbbbbbbbb')$$, :'form_id'),'22023');
select t_rejected(:'suite','an email answer must look like an email',format($$
  select public.submit_form_response(%L,'{"name":"x","stars":4,"mail":"not-mail"}','device-cccccccccccccccc')$$, :'form_id'),'22023');
select t_rejected(:'suite','a rating stays inside its stars',format($$
  select public.submit_form_response(%L,'{"name":"x","stars":9}','device-dddddddddddddddd')$$, :'form_id'),'22023');
select t_rejected(:'suite','a choice must be one of the options',format($$
  select public.submit_form_response(%L,'{"name":"x","stars":3,"pick":"ليلية"}','device-eeeeeeeeeeeeeeee')$$, :'form_id'),'22023');
select t_rejected(:'suite','answers to questions the form does not ask are refused',format($$
  select public.submit_form_response(%L,'{"name":"x","stars":3,"salary":1}','device-ffffffffffffffff')$$, :'form_id'),'22023');
select t_rejected(:'suite','a file answer must point inside this form''s folder',format($$
  select public.submit_form_response(%L,'{"name":"x","stars":3,"doc":[{"path":"%s/cv.pdf"}]}','device-gggggggggggggggg')$$, :'form_id', :'plain_id'),'22023');
select t_rejected(:'suite','a visitor cannot write a response directly',format($$
  insert into public.form_responses(form_id,answers) values (%L,'{}')$$, :'form_id'));
select t_visible(:'suite','a visitor cannot read responses','select 1 from public.form_responses',0);

-- Uploads -------------------------------------------------------------------------
select t_allowed(:'suite','a visitor uploads into an open form that asks for a file',format($$
  insert into storage.objects(bucket_id,name) values ('form-uploads','%s/cv.pdf')$$, :'form_id'));
select t_rejected(:'suite','a visitor cannot upload into a form without file questions',format($$
  insert into storage.objects(bucket_id,name) values ('form-uploads','%s/x.pdf')$$, :'plain_id'));
select t_rejected(:'suite','a visitor cannot put images on a form',format($$
  insert into storage.objects(bucket_id,name) values ('form-media','%s/cover.png')$$, :'form_id'));
select t_visible(:'suite','a visitor cannot read uploaded files',$$select 1 from storage.objects where bucket_id='form-uploads'$$,0);
select t_allowed(:'suite','a response can attach the uploaded file',format($$
  select public.submit_form_response(%L,'{"name":"ريم","stars":5,"doc":[{"path":"%s/cv.pdf","name":"cv.pdf"}]}','device-hhhhhhhhhhhhhhhh')$$, :'form_id', :'form_id'));

-- Responses by role ----------------------------------------------------------------
select test_sign_in(:'owner_id');
select t_visible(:'suite','the owner reads every response','select 1 from public.form_responses',2);
select t_true(:'suite','the dashboard counts responses and averages ratings',format(
  $$select responses = 2 and rating_avg = 4.5 from public.form_overview() where form_id = %L$$, :'form_id'));
select t_allowed(:'suite','the owner puts a cover on the form',format($$
  insert into storage.objects(bucket_id,name) values ('form-media','%s/cover.png')$$, :'form_id'));
select test_sign_in(:'viewer_id');
select t_visible(:'suite','a viewer reads responses','select 1 from public.form_responses',2);
select t_visible(:'suite','a viewer reads uploaded files',$$select 1 from storage.objects where bucket_id='form-uploads'$$,1);
select t_changed(:'suite','a viewer cannot delete responses','delete from public.form_responses',0);
select t_changed(:'suite','a viewer cannot delete uploaded files',$$delete from storage.objects where bucket_id='form-uploads'$$,0);
select test_sign_in(:'stranger_id');
select t_visible(:'suite','another administrator reads no responses','select 1 from public.form_responses',0);
select t_visible(:'suite','another administrator reads no uploads',$$select 1 from storage.objects where bucket_id='form-uploads'$$,0);
select t_visible(:'suite','another administrator gets no dashboard figures','select 1 from public.form_overview()',0);
select test_sign_in(:'employee_id');
select t_visible(:'suite','an employee reads no responses','select 1 from public.form_responses',0);
select test_sign_in(:'editor_id');
select t_changed(:'suite','an editor deletes an uploaded file',$$delete from storage.objects where bucket_id='form-uploads'$$,1);
select t_changed(:'suite','an editor deletes a response',
  $$delete from public.form_responses where id = (select id from public.form_responses order by created_at limit 1)$$,1);

-- Closing -------------------------------------------------------------------------
select test_sign_in(:'owner_id');
select t_changed(:'suite','the owner stops accepting responses',format($$update public.forms set accepting=false where id=%L$$, :'form_id'),1);
select test_sign_out();
select t_rejected(:'suite','a closed form refuses new responses',format($$
  select public.submit_form_response(%L,'{"name":"x","stars":3}','device-iiiiiiiiiiiiiiii')$$, :'form_id'));
select t_rejected(:'suite','a closed form refuses uploads',format($$
  insert into storage.objects(bucket_id,name) values ('form-uploads','%s/late.pdf')$$, :'form_id'));
select test_sign_in(:'owner_id');
select t_changed(:'suite','a form can close itself at a date',format($$
  update public.forms set accepting=true, close_at=now()-interval '1 minute' where id=%L$$, :'form_id'),1);
select test_sign_out();
select t_true(:'suite','past its closing date the form reports closed',format($$select (public.public_form(%L)->>'open')::boolean$$, :'form_id'),false);
select t_rejected(:'suite','past its closing date the form refuses responses',format($$
  select public.submit_form_response(%L,'{"name":"x","stars":3}','device-jjjjjjjjjjjjjjjj')$$, :'form_id'));
select t_rejected(:'suite','an unknown form reports not found',
  $$select public.submit_form_response('5ccccccc-cccc-4ccc-8ccc-cccccccccccc','{}')$$,'P0002');

-- Losing the administrator role -----------------------------------------------------
select test_sign_in(:'owner_id');
set local role postgres;
delete from public.user_roles where user_id = :'viewer_id';
insert into public.user_roles(user_id,role) values (:'viewer_id','employee');
select test_sign_in(:'viewer_id');
select t_visible(:'suite','a collaborator who stops being an administrator loses the form','select 1 from public.forms',0);

-- The fifty-person limit --------------------------------------------------------------
set local role postgres;
insert into auth.users(id,email)
  select ('56000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'forms-admin-' || i || '@reid.test' from generate_series(1, 48) i;
insert into public.user_roles(user_id,role)
  select ('56000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'admin' from generate_series(1, 48) i;
insert into public.form_collaborators(form_id,user_id,role)
  select :'form_id', ('56000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'viewer' from generate_series(1, 48) i;
select test_sign_in(:'owner_id');
select t_rejected(:'suite','a form is shared with at most fifty people',format($$
  insert into public.form_collaborators(form_id,user_id,role) values (%L,%L,'viewer')$$, :'form_id', :'stranger_id'),'23514');

-- Deleting ---------------------------------------------------------------------------
select t_changed(:'suite','the owner deletes the form with its responses',format($$delete from public.forms where id=%L$$, :'form_id'),1);
set local role postgres;
select t_visible(:'suite','its responses and sharing go with it',format(
  $$select 1 from public.form_responses where form_id=%L union all select 1 from public.form_collaborators where form_id=%L$$, :'form_id', :'form_id'),0);

\o
select label,case when ok then 'PASS' else 'FAIL' end as result,detail
from public.test_results where suite=:'suite' order by id;
select t_finish(:'suite');
rollback;
